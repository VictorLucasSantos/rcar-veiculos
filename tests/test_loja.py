import json
import re
from io import BytesIO
from urllib.parse import unquote

from PIL import Image
from sqlalchemy import select

from app.models import Foto, Veiculo
from app.servicos import ler_centavos, ler_inteiro, quilometros, reais, slugificar
from tests.conftest import ONIX, csrf_de


def _veiculo(sessao, modelo="Onix") -> Veiculo:
    sessao.expire_all()
    return sessao.scalar(select(Veiculo).where(Veiculo.modelo == modelo))


def _jpeg() -> bytes:
    saida = BytesIO()
    Image.new("RGB", (40, 30), "red").save(saida, "JPEG")
    return saida.getvalue()


def test_utilidades():
    assert reais(8990000) == "R$ 89.900"
    assert reais(8990050) == "R$ 89.900,50"
    assert ler_centavos("89.900") == 8990000
    assert ler_centavos("R$ 89.900,00") == 8990000
    assert ler_centavos("89900") == 8990000
    assert ler_centavos("") is None
    assert ler_inteiro("45.000 km") == 45000
    assert quilometros(45000) == "45.000 km" and quilometros(0) == "0 km"
    assert slugificar("Citroën C4 Cactus 2022") == "citroen-c4-cactus-2022"


def test_paginas_publicas_com_estoque_vazio(cliente):
    for url in ["/", "/estoque", "/sitemap.xml", "/robots.txt"]:
        assert cliente.get(url).status_code == 200, url
    assert "Pedir a lista" in cliente.get("/estoque").text
    assert cliente.get("/veiculo/nao-existe").status_code == 404


def test_painel_exige_login(cliente):
    resp = cliente.get("/admin/veiculos", follow_redirects=False)
    assert resp.status_code == 303 and resp.headers["location"] == "/admin/entrar"


def test_login_errado(cliente):
    pagina = cliente.get("/admin/entrar")
    r = cliente.post("/admin/entrar", data={"email": "teste@rcar.com", "senha": "x", "csrf": csrf_de(pagina.text)})
    assert r.status_code == 401


def test_post_sem_csrf_e_recusado(admin):
    assert admin.post("/admin/veiculos/novo", data={"marca": "Fiat", "modelo": "Uno"}).status_code == 400


def test_cadastrar_veiculo_aparece_no_site(cadastrar, cliente, sessao):
    r = cadastrar()
    assert r.status_code == 303
    v = _veiculo(sessao)
    assert v.preco == 8990000 and v.km == 45000
    assert v.slug == "chevrolet-onix-1-0-turbo-ltz-2022"
    assert v.ano == "2021/2022"
    assert v.lista_opcionais == ["Ar-condicionado", "Câmera de ré"]

    estoque = cliente.get("/estoque").text
    assert "Onix" in estoque and "R$ 89.900" in estoque and "45.000 km" in estoque
    pagina = cliente.get(f"/veiculo/{v.slug}")
    assert pagina.status_code == 200
    assert "Câmera de ré" in pagina.text
    texto = unquote(pagina.text)
    assert "Tenho interesse no Chevrolet Onix 1.0 Turbo LTZ 2021/2022 (R$ 89.900)." in texto


def test_preco_vazio_mostra_consulte(cadastrar, cliente):
    cadastrar(preco="")
    assert "Consulte o preço" in cliente.get("/estoque").text


def test_validacao_dos_anos(cadastrar):
    r = cadastrar(ano_fabricacao="2021", ano_modelo="2024")
    assert r.status_code == 422 and "ano do modelo" in r.text
    assert cadastrar(ano_fabricacao="1900").status_code == 422
    assert cadastrar(marca="").status_code == 422


def test_vendido_sai_do_site_e_conta_no_mes(cadastrar, admin, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get("/admin/veiculos").text)
    admin.post(f"/admin/veiculos/{v.id}/situacao", data={"csrf": csrf, "situacao": "vendido"})
    v = _veiculo(sessao)
    assert v.situacao == "vendido" and v.vendido_em is not None
    assert cliente.get(f"/veiculo/{v.slug}").status_code == 404
    assert "Onix" not in cliente.get("/estoque").text
    assert "Onix" in admin.get("/admin/veiculos?situacao=vendido").text

    admin.post(f"/admin/veiculos/{v.id}/situacao", data={"csrf": csrf, "situacao": "disponivel"})
    assert _veiculo(sessao).vendido_em is None


def test_reservado_continua_no_site_com_selo(cadastrar, cliente):
    cadastrar(situacao="reservado")
    assert "Reservado" in cliente.get("/estoque").text


def test_oculto_nao_aparece(cadastrar, cliente):
    cadastrar(ativo=None)
    assert "Onix" not in cliente.get("/").text


def test_editar_veiculo(cadastrar, admin, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get(f"/admin/veiculos/{v.id}").text)
    admin.post(f"/admin/veiculos/{v.id}", data={**ONIX, "preco": "85.000", "km": "46.200", "csrf": csrf})
    v = _veiculo(sessao)
    assert v.preco == 8500000 and v.km == 46200


def test_fotos_capa_e_apagar(cadastrar, admin, sessao, cliente):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get(f"/admin/veiculos/{v.id}").text)
    arquivos = [("fotos", ("a.jpg", _jpeg(), "image/jpeg")), ("fotos", ("b.jpg", _jpeg(), "image/jpeg"))]
    admin.post(f"/admin/veiculos/{v.id}/fotos", data={"csrf": csrf}, files=arquivos)
    v = _veiculo(sessao)
    assert len(v.fotos) == 2
    (primeira, arquivo), segunda = (v.fotos[0].id, v.fotos[0].arquivo), v.fotos[1].id
    assert cliente.get(f"/media/{arquivo}").status_code == 200

    admin.post(f"/admin/veiculos/{v.id}/fotos/{segunda}/capa", data={"csrf": csrf})
    assert _veiculo(sessao).foto_capa.id == segunda

    admin.post(f"/admin/veiculos/{v.id}/fotos/{primeira}/apagar", data={"csrf": csrf})
    assert [f.id for f in _veiculo(sessao).fotos] == [segunda]
    assert cliente.get(f"/media/{arquivo}").status_code == 404


def test_foto_invalida_e_recusada(cadastrar, admin, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get(f"/admin/veiculos/{v.id}").text)
    r = admin.post(f"/admin/veiculos/{v.id}/fotos", data={"csrf": csrf}, files=[("fotos", ("x.jpg", b"nada", "image/jpeg"))])
    assert "não é uma imagem válida" in r.text
    assert _veiculo(sessao).fotos == []


def test_apagar_veiculo(cadastrar, admin, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get(f"/admin/veiculos/{v.id}").text)
    admin.post(f"/admin/veiculos/{v.id}/apagar", data={"csrf": csrf})
    assert _veiculo(sessao) is None


def test_configuracoes_mudam_whatsapp(admin, cadastrar, cliente, sessao):
    csrf = csrf_de(admin.get("/admin/configuracoes").text)
    admin.post("/admin/configuracoes", data={"csrf": csrf, "whatsapp": "+55 (69) 91111-2222", "nome_loja": "R-CAR Veículos"})
    cadastrar()
    v = _veiculo(sessao)
    assert "https://wa.me/5569911112222?text=" in cliente.get(f"/veiculo/{v.slug}").text


def test_modo_estatico_usa_url_publica(cadastrar, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    cabecalhos = {"X-Exportar-Estatico": "1", "X-Url-Publica": "https://exemplo.github.io/rcar"}
    html = cliente.get(f"/veiculo/{v.slug}", headers=cabecalhos).text
    assert 'class="estatico"' in html
    assert unquote(f"https://exemplo.github.io/rcar/veiculo/{v.slug}/") in unquote(html)
    assert "/static/js/demo.js" in html
    assert "/static/js/demo.js" not in cliente.get(f"/veiculo/{v.slug}").text


def test_demonstracao_so_existe_na_exportacao(cadastrar, admin, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get("/admin/veiculos").text)
    admin.post(f"/admin/veiculos/{v.id}/situacao", data={"csrf": csrf, "situacao": "vendido"})

    for url in ["/demo/admin", "/demo/veiculo", "/demo/estoque.json"]:
        assert cliente.get(url).status_code == 404, url

    cabecalhos = {"X-Exportar-Estatico": "1"}
    assert "demo-admin.js" in cliente.get("/demo/admin", headers=cabecalhos).text
    assert "data-demo-veiculo" in cliente.get("/demo/veiculo", headers=cabecalhos).text
    dados = cliente.get("/demo/estoque.json", headers=cabecalhos).json()
    # O painel vê também os vendidos.
    [item] = [d for d in dados["veiculos"] if not d.get("exemplo")]
    assert item["modelo"] == "Onix" and item["situacao"] == "vendido" and item["vendido_em"]
    assert item["preco"] == 8990000 and item["fotos"] == []
    assert dados["loja"]["whatsapp"] and dados["versao"]


def test_demonstracao_tem_historico_de_exemplo(cadastrar, cliente):
    cadastrar()
    dados = cliente.get("/demo/estoque.json", headers={"X-Exportar-Estatico": "1"}).json()
    exemplos = [v for v in dados["veiculos"] if v.get("exemplo")]
    assert len(exemplos) >= 12 * 6 - 12
    assert all(v["situacao"] == "vendido" and v["vendido_em"] and v["criado_em"] < v["vendido_em"] for v in exemplos)
    # Sempre o mesmo histórico (semente fixa) para a demonstração não mudar a cada exportação.
    de_novo = cliente.get("/demo/estoque.json", headers={"X-Exportar-Estatico": "1"}).json()
    assert [v["preco"] for v in de_novo["veiculos"]] == [v["preco"] for v in dados["veiculos"]]


def test_dashboard_de_vendas_usa_so_dados_reais(cadastrar, admin, sessao):
    cadastrar()
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get("/admin/veiculos").text)
    admin.post(f"/admin/veiculos/{v.id}/situacao", data={"csrf": csrf, "situacao": "vendido"})
    pagina = admin.get("/admin/vendas")
    assert pagina.status_code == 200 and "vendas.js" in pagina.text
    dados = json.loads(re.search(r'data-veiculos>(.*?)</script>', pagina.text, re.S).group(1))
    assert [d["situacao"] for d in dados] == ["vendido"] and not any(d.get("exemplo") for d in dados)


def test_foto_ilustrativa_mostra_selo_e_credito(cadastrar, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    v.fotos.append(Foto(arquivo="x.jpg", credito="Fulano · CC BY-SA 4.0 · Wikimedia Commons", fonte="https://commons.wikimedia.org/wiki/File:X.jpg"))
    sessao.commit()
    assert "Foto ilustrativa" in cliente.get("/estoque").text
    pagina = cliente.get(f"/veiculo/{v.slug}").text
    assert "não é o carro à venda" in pagina and "Fulano · CC BY-SA 4.0" in pagina


def _salvar(admin, v, **mudancas):
    csrf = csrf_de(admin.get(f"/admin/veiculos/{v.id}").text)
    return admin.post(f"/admin/veiculos/{v.id}", data={**ONIX, **mudancas, "csrf": csrf}, follow_redirects=False)


def test_baixar_preco_vira_oferta_de_por(cadastrar, admin, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    _salvar(admin, v, preco="84.900")
    v = _veiculo(sessao)
    assert v.preco_anterior == 8990000 and v.desconto == 500000 and v.desconto_pct == 6
    assert "Preço baixou" in admin.get(f"/admin/veiculos/{v.id}").text

    estoque = cliente.get("/estoque").text
    assert "Baixou 6%" in estoque and "<s>R$ 89.900</s>" in estoque and "R$ 5.000 a menos" in estoque
    assert 'data-desconto="500000"' in estoque

    # Apagar o "De" encerra a oferta e não volta sozinho na próxima edição.
    _salvar(admin, v, preco="84.900", preco_anterior="")
    assert _veiculo(sessao).preco_anterior is None
    _salvar(admin, v, preco="84.900", preco_anterior="")
    assert _veiculo(sessao).preco_anterior is None


def test_preco_de_precisa_ser_maior(cadastrar):
    r = cadastrar(preco="80.000", preco_anterior="79.000")
    assert r.status_code == 422 and "precisa ser maior" in r.text


def test_preco_subir_acima_do_de_encerra_oferta(cadastrar, admin, sessao):
    cadastrar(preco="80.000", preco_anterior="90.000")
    v = _veiculo(sessao)
    assert v.desconto == 1000000
    _salvar(admin, v, preco="95.000", preco_anterior="")
    assert _veiculo(sessao).desconto == 0


def test_vender_pede_valores_e_dashboard_ve_margem(cadastrar, admin, sessao):
    cadastrar(preco_compra="70.000")
    v = _veiculo(sessao)
    csrf = csrf_de(admin.get("/admin/veiculos").text)
    r = admin.post(f"/admin/veiculos/{v.id}/situacao", data={"csrf": csrf, "situacao": "vendido"}, follow_redirects=False)
    assert r.headers["location"] == f"/admin/veiculos/{v.id}#venda"
    _salvar(admin, v, situacao="vendido", preco_compra="70.000", preco_venda="86.000", origem_venda="Instagram")
    v = _veiculo(sessao)
    assert (v.preco_venda, v.preco_compra, v.origem_venda) == (8600000, 7000000, "Instagram")
    assert "Margem: R$ 16.000" in admin.get(f"/admin/veiculos/{v.id}").text
    pagina = admin.get("/admin/vendas").text
    [dado] = json.loads(re.search(r"data-veiculos>(.*?)</script>", pagina, re.S).group(1))
    assert dado["preco_venda"] == 8600000 and dado["preco_compra"] == 7000000


def test_origem_invalida_e_recusada(cadastrar):
    assert cadastrar(origem_venda="Rádio").status_code == 422


def test_custo_e_venda_nao_vao_para_a_copia_publica(cadastrar, admin, cliente, sessao):
    cadastrar(preco_compra="70.000", preco_venda="86.000", origem_venda="Salão")
    dados = cliente.get("/demo/estoque.json", headers={"X-Exportar-Estatico": "1"}).json()
    [real] = [d for d in dados["veiculos"] if not d.get("exemplo")]
    assert real["preco_compra"] is None and real["preco_venda"] is None and real["origem_venda"] == ""
    assert "70.000" not in cliente.get(f"/veiculo/{_veiculo(sessao).slug}").text


def test_completar_fichas(cadastrar, admin, sessao):
    cadastrar(km="", cambio="", combustivel="")
    v = _veiculo(sessao)
    assert v.ficha_incompleta
    pagina = admin.get("/admin/fichas").text
    assert f'name="km-{v.id}"' in pagina
    assert "sem km, câmbio ou combustível" in admin.get("/admin").text
    slug = v.slug
    admin.post("/admin/fichas", data={
        "csrf": csrf_de(pagina), "id": str(v.id), f"versao-{v.id}": "1.0 LT", f"km-{v.id}": "52.300",
        f"cambio-{v.id}": "Manual", f"combustivel-{v.id}": "Flex", f"cor-{v.id}": "Prata", f"preco_compra-{v.id}": "71.000",
    })
    v = _veiculo(sessao)
    assert (v.versao, v.km, v.cambio, v.combustivel, v.cor, v.preco_compra) == ("1.0 LT", 52300, "Manual", "Flex", "Prata", 7100000)
    assert not v.ficha_incompleta and v.slug == slug
    assert f'name="km-{v.id}"' not in admin.get("/admin/fichas").text


def test_site_sem_laco_nem_financiamento(cadastrar, cliente, sessao):
    cadastrar()
    v = _veiculo(sessao)
    for url in ["/", "/estoque", f"/veiculo/{v.slug}"]:
        texto = cliente.get(url).text.lower()
        assert "laço" not in texto and "financiamento" not in texto, url
