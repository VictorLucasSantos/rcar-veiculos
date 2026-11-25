"""Páginas públicas: início, estoque e página do veículo. E as páginas da demonstração do painel,
que só existem na cópia estática do GitHub Pages."""

import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import obter_sessao
from app.models import CAMBIOS, COMBUSTIVEIS, MARCAS, ORIGENS_VENDA, Veiculo
from app.servicos import ler_config, link_whatsapp, mensagem_interesse, veiculo_para_json
from app.web import eh_exportacao, render, url_publica

roteador = APIRouter()

NO_INICIO = 6


def consulta_estoque():
    """Veículos que aparecem no site: ativos e não vendidos. Destaques primeiro, depois os mais novos no salão."""
    return (
        select(Veiculo)
        .where(Veiculo.ativo.is_(True), Veiculo.situacao != "vendido")
        .options(selectinload(Veiculo.fotos))
        .order_by(Veiculo.destaque.desc(), (Veiculo.situacao == "reservado").asc(), Veiculo.criado_em.desc())
    )


@roteador.get("/")
def inicio(request: Request, sessao: Session = Depends(obter_sessao)):
    veiculos = list(sessao.scalars(consulta_estoque()))
    return render(
        request, sessao, "loja/inicio.html", {"veiculos": veiculos[:NO_INICIO], "total_estoque": len(veiculos)}
    )


@roteador.get("/estoque")
def estoque(request: Request, sessao: Session = Depends(obter_sessao)):
    veiculos = list(sessao.scalars(consulta_estoque()))
    marcas = sorted({v.marca for v in veiculos})
    cambios = sorted({v.cambio for v in veiculos if v.cambio})
    return render(request, sessao, "loja/estoque.html", {"veiculos": veiculos, "marcas": marcas, "cambios": cambios})


@roteador.get("/veiculo/{slug}")
def veiculo(slug: str, request: Request, sessao: Session = Depends(obter_sessao)):
    item = sessao.scalar(consulta_estoque().where(Veiculo.slug == slug))
    if item is None:
        raise HTTPException(404)
    loja = ler_config(sessao)
    # Na cópia estática cada página é uma pasta, então o link leva a barra no fim.
    endereco = f"{url_publica(request)}/veiculo/{item.slug}" + ("/" if eh_exportacao(request) else "")
    outros = list(sessao.scalars(consulta_estoque().where(Veiculo.id != item.id).limit(3)))
    return render(
        request,
        sessao,
        "loja/veiculo.html",
        {
            "veiculo": item,
            "outros": outros,
            "url_interesse": link_whatsapp(loja["whatsapp"], mensagem_interesse(item, loja, endereco)),
        },
    )


# ---------------------------------------------------------------- demonstração do painel (cópia estática)


def _so_na_exportacao(request: Request) -> None:
    """No servidor de verdade o painel é o /admin; estas páginas só servem ao exportador do GitHub Pages."""
    if not eh_exportacao(request):
        raise HTTPException(404)


@roteador.get("/demo/admin")
def demo_admin(request: Request, sessao: Session = Depends(obter_sessao)):
    _so_na_exportacao(request)
    listas = {"marcas": MARCAS, "cambios": CAMBIOS, "combustiveis": COMBUSTIVEIS, "origens": ORIGENS_VENDA}
    return render(request, sessao, "demo/admin.html", {"listas": listas})


@roteador.get("/demo/veiculo")
def demo_veiculo(request: Request, sessao: Session = Depends(obter_sessao)):
    _so_na_exportacao(request)
    return render(request, sessao, "demo/veiculo.html")


@roteador.get("/demo/placa")
def demo_placa(request: Request, sessao: Session = Depends(obter_sessao)):
    _so_na_exportacao(request)
    return render(request, sessao, "demo/placa.html")


@roteador.get("/demo/estoque.json")
def demo_estoque(request: Request, sessao: Session = Depends(obter_sessao)):
    """Todos os veículos (também vendidos e ocultos), como o painel vê. Cada exportação é uma versão nova."""
    _so_na_exportacao(request)
    loja = ler_config(sessao)
    veiculos = [
        veiculo_para_json(v)
        for v in sessao.scalars(select(Veiculo).options(selectinload(Veiculo.fotos)).order_by(Veiculo.id))
    ]
    return {
        "versao": datetime.now().isoformat(timespec="seconds"),
        "loja": {chave: loja[chave] for chave in ("nome_loja", "whatsapp", "cidade", "instagram")},
        "veiculos": veiculos + vendas_de_exemplo(veiculos),
    }


def vendas_de_exemplo(veiculos: list[dict], meses: int = 12) -> list[dict]:
    """Histórico fictício de vendas para o dashboard da demonstração, marcado com "exemplo".

    Sorteia (sempre igual, semente fixa) carros parecidos com o estoque, com preço variando até 12%,
    6 a 13 vendas por mês nos últimos `meses`, e 5 a 75 dias entre o cadastro e a venda."""
    modelos = [v for v in veiculos if v["preco"]]
    if not modelos:
        return []
    sorteio = random.Random(2026)
    hoje = datetime.now()
    proximo_id = max(v["id"] for v in veiculos) + 1000
    vendas = []
    for atras in range(meses - 1, -1, -1):
        ano_mes, mes = divmod(hoje.year * 12 + hoje.month - 1 - atras, 12)
        inicio = datetime(ano_mes, mes + 1, 1)
        ultimo_dia = hoje.day if atras == 0 else 28
        for _ in range(sorteio.randint(6, 13) if atras else sorteio.randint(2, 6)):
            base = sorteio.choice(modelos)
            vendido_em = inicio.replace(day=sorteio.randint(1, ultimo_dia), hour=sorteio.randint(9, 18))
            ano = base["ano_modelo"] - sorteio.choice([0, 0, 1, 2])
            anuncio = round(base["preco"] * sorteio.uniform(0.88, 1.08) / 50000) * 50000
            venda = round(anuncio * sorteio.uniform(0.93, 1.0) / 50000) * 50000
            vendas.append({
                **base,
                "id": proximo_id,
                "ano_fabricacao": ano,
                "ano_modelo": ano,
                "preco": anuncio,
                "preco_anterior": None,
                "preco_venda": venda,
                "preco_compra": round(venda * sorteio.uniform(0.80, 0.92) / 50000) * 50000,
                "origem_venda": sorteio.choices(ORIGENS_VENDA, weights=[38, 22, 14, 6, 10, 8, 2])[0],
                "situacao": "vendido",
                "destaque": False,
                "criado_em": (vendido_em - timedelta(days=sorteio.randint(5, 75))).isoformat(timespec="seconds"),
                "vendido_em": vendido_em.isoformat(timespec="seconds"),
                "exemplo": True,
            })
            proximo_id += 1
    return vendas


# ---------------------------------------------------------------- SEO


@roteador.get("/robots.txt", response_class=PlainTextResponse)
def robots(request: Request):
    return f"User-agent: *\nDisallow: /admin\nSitemap: {str(request.base_url).rstrip('/')}/sitemap.xml\n"


@roteador.get("/sitemap.xml")
def sitemap(request: Request, sessao: Session = Depends(obter_sessao)):
    base = str(request.base_url).rstrip("/")
    hoje = date.today().isoformat()
    urls = [f"{base}/", f"{base}/estoque"]
    urls += [f"{base}/veiculo/{v.slug}" for v in sessao.scalars(consulta_estoque())]
    corpo = "".join(f"<url><loc>{u}</loc><lastmod>{hoje}</lastmod></url>" for u in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{corpo}</urlset>'
    return Response(xml, media_type="application/xml")
