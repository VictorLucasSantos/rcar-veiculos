"""Tabelas da loja. Preço em centavos (inteiro) para não errar arredondamento."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

SITUACOES = {
    "disponivel": "Disponível",
    "reservado": "Reservado",
    "vendido": "Vendido",
}

CAMBIOS = ["Manual", "Automático", "CVT", "Automatizado"]
COMBUSTIVEIS = ["Flex", "Gasolina", "Etanol", "Diesel", "Híbrido", "Elétrico"]
ORIGENS_VENDA = ["WhatsApp", "Instagram", "Facebook/Marketplace", "Site", "Indicação", "Salão", "Outro"]
MARCAS = [
    "Chevrolet", "Fiat", "Volkswagen", "Toyota", "Hyundai", "Honda", "Jeep", "Renault", "Ford",
    "Nissan", "Peugeot", "Citroën", "Mitsubishi", "Land Rover", "BMW", "Mercedes-Benz", "Audi", "BYD",
]


class Veiculo(Base):
    __tablename__ = "veiculo"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    marca: Mapped[str] = mapped_column(String(40))
    modelo: Mapped[str] = mapped_column(String(60))
    versao: Mapped[str] = mapped_column(String(80), default="")
    ano_fabricacao: Mapped[int] = mapped_column(Integer)
    ano_modelo: Mapped[int] = mapped_column(Integer)
    km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cambio: Mapped[str] = mapped_column(String(20), default="")
    combustivel: Mapped[str] = mapped_column(String(20), default="")
    cor: Mapped[str] = mapped_column(String(30), default="")
    # Vazio = "Consulte" na loja.
    preco: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Preço "De" (maior que o atual): o site mostra "De R$ X por R$ Y". Precisa ser um preço que o
    # carro de fato teve; o painel preenche sozinho quando o preço baixa.
    preco_anterior: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Só no painel: quanto a loja pagou, por quanto vendeu e de onde veio o comprador.
    preco_compra: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preco_venda: Mapped[int | None] = mapped_column(Integer, nullable=True)
    origem_venda: Mapped[str] = mapped_column(String(30), default="")
    descricao: Mapped[str] = mapped_column(Text, default="")
    # Um opcional por linha.
    opcionais: Mapped[str] = mapped_column(Text, default="")
    situacao: Mapped[str] = mapped_column(String(20), default="disponivel")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    destaque: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    vendido_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    fotos: Mapped[list["Foto"]] = relationship(
        back_populates="veiculo", cascade="all, delete-orphan", order_by="Foto.ordem"
    )

    @property
    def nome(self) -> str:
        return f"{self.marca} {self.modelo}"

    @property
    def titulo(self) -> str:
        return f"{self.nome} {self.versao}".strip()

    @property
    def ano(self) -> str:
        if self.ano_fabricacao == self.ano_modelo:
            return str(self.ano_modelo)
        return f"{self.ano_fabricacao}/{self.ano_modelo}"

    @property
    def foto_capa(self) -> "Foto | None":
        return self.fotos[0] if self.fotos else None

    @property
    def lista_opcionais(self) -> list[str]:
        return [linha.strip() for linha in self.opcionais.splitlines() if linha.strip()]

    @property
    def na_loja(self) -> bool:
        """Aparece no site: ativo e ainda não vendido."""
        return self.ativo and self.situacao != "vendido"

    @property
    def desconto(self) -> int:
        """Quanto baixou em relação ao preço "De" (0 quando não há oferta)."""
        if self.preco and self.preco_anterior and self.preco_anterior > self.preco:
            return self.preco_anterior - self.preco
        return 0

    @property
    def desconto_pct(self) -> int:
        return round(100 * self.desconto / self.preco_anterior) if self.desconto else 0

    @property
    def ficha_incompleta(self) -> bool:
        return self.km is None or not self.cambio or not self.combustivel


class Foto(Base):
    __tablename__ = "foto"

    id: Mapped[int] = mapped_column(primary_key=True)
    veiculo_id: Mapped[int] = mapped_column(ForeignKey("veiculo.id", ondelete="CASCADE"))
    arquivo: Mapped[str] = mapped_column(String(200))
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    # Preenchidos só em foto ilustrativa (de outro carro do mesmo modelo): autor, licença e página de origem.
    credito: Mapped[str] = mapped_column(String(300), default="")
    fonte: Mapped[str] = mapped_column(String(300), default="")

    veiculo: Mapped[Veiculo] = relationship(back_populates="fotos")

    @property
    def ilustrativa(self) -> bool:
        return bool(self.credito)


class Configuracao(Base):
    __tablename__ = "configuracao"

    chave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(Text, default="")


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    nome: Mapped[str] = mapped_column(String(80))
    senha_hash: Mapped[str] = mapped_column(String(200))
