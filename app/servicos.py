"""Regras da loja: configurações, formatação, veículos, fotos, senhas e WhatsApp."""

import hashlib
import hmac
import re
import secrets
import unicodedata
import uuid
from datetime import datetime
from io import BytesIO
from urllib.parse import quote

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import SITUACOES, Configuracao, Usuario, Veiculo

# ---------------------------------------------------------------- configurações

PADROES = {
    "nome_loja": "R-CAR Veículos",
    "whatsapp": "5569993326685",
    "instagram": "rcarveiculos_",
    "endereco": "Rua Belo Horizonte, 3716, Setor 5",
    "cidade": "Jaru-RO",
    "horario": "",
}

ROTULOS_CONFIG = {
    "nome_loja": "Nome da loja",
    "whatsapp": "WhatsApp que recebe os interessados (com 55 e DDD, só números)",
    "instagram": "Usuário do Instagram (sem @)",
    "endereco": "Endereço",
    "cidade": "Cidade",
    "horario": "Horário de funcionamento (vazio = não aparece)",
}


def ler_config(sessao: Session) -> dict[str, str]:
    valores = dict(PADROES)
    for item in sessao.scalars(select(Configuracao)):
        valores[item.chave] = item.valor
    return valores


def salvar_config(sessao: Session, novos: dict[str, str]) -> None:
    for chave, valor in novos.items():
        if chave not in PADROES:
            continue
        valor = valor.strip()
        if chave == "whatsapp":
            valor = so_digitos(valor)
        if chave == "instagram":
            valor = valor.lstrip("@")
        item = sessao.get(Configuracao, chave)
        if item is None:
            sessao.add(Configuracao(chave=chave, valor=valor))
        else:
            item.valor = valor
    sessao.commit()


# ---------------------------------------------------------------- utilidades


def so_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def slugificar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-") or "veiculo"


def slug_unico(sessao: Session, texto: str, ignorar_id: int | None = None) -> str:
    base = slugificar(texto)
    slug, n = base, 2
    while True:
        existente = sessao.scalar(select(Veiculo).where(Veiculo.slug == slug))
        if existente is None or existente.id == ignorar_id:
            return slug
        slug, n = f"{base}-{n}", n + 1


def milhar(numero: int) -> str:
    return f"{numero:,}".replace(",", ".")


def reais(centavos: int | None) -> str:
    if centavos is None:
        return ""
    inteiro, cent = divmod(abs(centavos), 100)
    texto = f"R$ {milhar(inteiro)}" + (f",{cent:02d}" if cent else "")
    return f"-{texto}" if centavos < 0 else texto


def quilometros(km: int | None) -> str:
    if km is None:
        return ""
    return "0 km" if km == 0 else f"{milhar(km)} km"


def ler_centavos(texto: str) -> int | None:
    """Aceita '89.900', '89900', '89.900,00', 'R$ 89.900' ou '89900.50'. Vazio vira None."""
    texto = (texto or "").replace("R$", "").replace(" ", "").strip()
    if not texto:
        return None
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", texto):
        # Ponto como separador de milhar: 89.900
        texto = texto.replace(".", "")
    try:
        valor = round(float(texto) * 100)
    except ValueError as erro:
        raise ValueError(f"Preço inválido: {texto!r}") from erro
    if valor < 0:
        raise ValueError("Preço não pode ser negativo")
    return valor


def ler_inteiro(texto: str) -> int | None:
    """'45.000', '45000' ou '45 000 km' viram 45000. Vazio vira None."""
    digitos = so_digitos(texto)
    return int(digitos) if digitos else None


def formatar_telefone(digitos: str) -> str:
    d = so_digitos(digitos)
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return digitos


# ---------------------------------------------------------------- veículos


def mudar_situacao(veiculo: Veiculo, nova: str) -> None:
    """Guarda a data da venda para o resumo do mês; voltar para disponível limpa a data."""
    if nova not in SITUACOES:
        raise ValueError("Situação inválida.")
    if nova == "vendido" and veiculo.situacao != "vendido":
        veiculo.vendido_em = datetime.now()
    elif nova != "vendido":
        veiculo.vendido_em = None
    veiculo.situacao = nova


def definir_preco(veiculo: Veiculo, novo: int | None, de: int | None) -> bool:
    """Grava o preço e o preço "De". Devolve True quando o "De" foi preenchido sozinho.

    - "De" informado precisa ser maior que o preço novo.
    - Primeira baixa de preço sem "De" informado: o preço antigo vira o "De" (é um preço que o carro
      teve de verdade). Se a pessoa apagar o "De" depois, ele não volta sozinho.
    - Preço que sobe até o "De" ou passa dele encerra a oferta."""
    if de is not None:
        if novo is None or de <= novo:
            raise ValueError("O preço “De” precisa ser maior que o preço atual.")
        veiculo.preco, veiculo.preco_anterior = novo, de
        return False
    automatico = (
        veiculo.id is not None
        and veiculo.preco_anterior is None
        and veiculo.preco is not None
        and novo is not None
        and novo < veiculo.preco
    )
    veiculo.preco_anterior = veiculo.preco if automatico else None
    veiculo.preco = novo
    return automatico


def veiculo_para_json(v: Veiculo, privado: bool = False) -> dict:
    """Dados do veículo para o JavaScript (dashboard de vendas e demonstração do painel).

    `privado` inclui custo, valor de venda e origem do comprador: só para o painel com login,
    nunca para a cópia pública do GitHub Pages."""
    dados = {
        "id": v.id,
        "slug": v.slug,
        "marca": v.marca,
        "modelo": v.modelo,
        "versao": v.versao,
        "ano_fabricacao": v.ano_fabricacao,
        "ano_modelo": v.ano_modelo,
        "km": v.km,
        "cambio": v.cambio,
        "combustivel": v.combustivel,
        "cor": v.cor,
        "preco": v.preco,
        "preco_anterior": v.preco_anterior if v.desconto else None,
        "descricao": v.descricao,
        "opcionais": v.opcionais,
        "situacao": v.situacao,
        "ativo": v.ativo,
        "destaque": v.destaque,
        "criado_em": v.criado_em.isoformat(timespec="seconds"),
        "vendido_em": v.vendido_em.isoformat(timespec="seconds") if v.vendido_em else None,
        "fotos": [f"/media/{f.arquivo}" for f in v.fotos],
        # Fotos ilustrativas (não são do carro à venda) levam crédito do autor e da licença.
        "creditos": {f"/media/{f.arquivo}": {"texto": f.credito, "fonte": f.fonte} for f in v.fotos if f.credito},
        "preco_compra": None,
        "preco_venda": None,
        "origem_venda": "",
    }
    if privado:
        dados.update(preco_compra=v.preco_compra, preco_venda=v.preco_venda, origem_venda=v.origem_venda)
    return dados


def dados_arte(v: Veiculo, loja: dict[str, str]) -> dict:
    """O que static/js/arte.js precisa para desenhar a arte de Instagram do veículo."""
    if v.situacao == "reservado":
        selo = "Reservado"
    elif v.desconto:
        selo = f"Baixou {v.desconto_pct}%"
    elif v.destaque:
        selo = "Destaque"
    else:
        selo = ""
    capa = v.foto_capa
    return {
        "nome": v.nome,
        "versao": v.versao,
        "ano": v.ano,
        "ficha": [v.ano, quilometros(v.km), v.cambio, v.combustivel],
        "preco": v.preco,
        "preco_anterior": v.preco_anterior if v.desconto else None,
        "selo": selo,
        "oferta": bool(v.desconto) and v.situacao != "reservado",
        "foto": f"/media/{capa.arquivo}" if capa else None,
        "ilustrativa": bool(capa and capa.ilustrativa),
        "logo": "/static/img/logo.png",
        "loja": {"telefone": formatar_telefone(loja["whatsapp"]), "instagram": loja["instagram"], "endereco": loja["cidade"]},
    }


def dados_placa(v: Veiculo, loja: dict[str, str], url: str) -> dict:
    """O que static/js/placa.js precisa para montar a placa do vidro. `url` é a página do carro no site."""
    arte = dados_arte(v, loja)
    return {
        "nome": v.nome,
        "versao": v.versao,
        "ficha": arte["ficha"],
        "preco": v.preco,
        "preco_anterior": arte["preco_anterior"],
        "selo": arte["selo"],
        "situacao": v.situacao,
        "opcionais": v.lista_opcionais[:8],
        "url": url,
        "aviso": None if v.na_loja else "Este carro não aparece no site agora (vendido ou oculto): o QR vai abrir uma página que não existe.",
        "logo": "/static/img/logo.png",
        "loja": {
            "nome_loja": loja["nome_loja"],
            "telefone": formatar_telefone(loja["whatsapp"]),
            "instagram": loja["instagram"],
            "cidade": loja["cidade"],
        },
    }


def mensagem_interesse(veiculo: Veiculo, loja: dict[str, str], url: str = "") -> str:
    partes = [f"Olá, {loja['nome_loja']}! Tenho interesse no {veiculo.titulo} {veiculo.ano}"]
    if veiculo.preco:
        partes[0] += f" ({reais(veiculo.preco)})"
    partes[0] += "."
    if url:
        partes.append(url)
    return "\n".join(partes)


def link_whatsapp(numero: str, texto: str = "") -> str:
    base = f"https://wa.me/{so_digitos(numero)}"
    return f"{base}?text={quote(texto)}" if texto else base


# ---------------------------------------------------------------- senhas


def gerar_hash(senha: str) -> str:
    sal = secrets.token_bytes(16)
    chave = hashlib.scrypt(senha.encode(), salt=sal, n=2**14, r=8, p=1)
    return f"scrypt${sal.hex()}${chave.hex()}"


def conferir_senha(senha: str, guardado: str) -> bool:
    try:
        _, sal, chave = guardado.split("$")
    except ValueError:
        return False
    calculado = hashlib.scrypt(senha.encode(), salt=bytes.fromhex(sal), n=2**14, r=8, p=1)
    return hmac.compare_digest(calculado.hex(), chave)


def autenticar(sessao: Session, email: str, senha: str) -> Usuario | None:
    usuario = sessao.scalar(select(Usuario).where(Usuario.email == email.strip().lower()))
    if usuario and conferir_senha(senha, usuario.senha_hash):
        return usuario
    return None


# ---------------------------------------------------------------- fotos


def salvar_foto(conteudo: bytes) -> str:
    """Normaliza a foto (orientação, tamanho, JPEG) e devolve o nome do arquivo."""
    if len(conteudo) > config.TAMANHO_MAX_FOTO:
        raise ValueError("Foto maior que 10 MB")
    try:
        imagem = Image.open(BytesIO(conteudo))
        imagem = ImageOps.exif_transpose(imagem).convert("RGB")
    except Exception as erro:  # Pillow levanta vários tipos
        raise ValueError("Arquivo não é uma imagem válida (use JPG, PNG ou WebP)") from erro
    imagem.thumbnail((config.LADO_MAX_FOTO, config.LADO_MAX_FOTO))
    config.PASTA_UPLOADS.mkdir(parents=True, exist_ok=True)
    nome = f"{uuid.uuid4().hex}.jpg"
    imagem.save(config.PASTA_UPLOADS / nome, "JPEG", quality=84, optimize=True, progressive=True)
    return nome


def apagar_arquivo_foto(nome: str) -> None:
    caminho = config.PASTA_UPLOADS / nome
    if caminho.is_file():
        caminho.unlink()
