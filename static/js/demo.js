/* Demonstração do painel na cópia estática (GitHub Pages). O estoque editado no /admin/ de
   demonstração fica no localStorage deste navegador e substitui o estoque publicado nas páginas
   do site. Usado por site.js (páginas públicas) e demo-admin.js (painel). */
(() => {
  "use strict";

  const CHAVE = "rcar-demo-v1";
  // A cópia pode estar numa subpasta (/rcar-veiculos); o ícone sempre aponta para a raiz certa.
  const icone = document.querySelector('link[rel="icon"]');
  const raiz = icone ? icone.getAttribute("href").replace(/\/static\/img\/logo\.png.*$/, "") : "";
  const SITUACOES = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

  function ler() {
    try {
      const texto = localStorage.getItem(CHAVE);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }

  // Lança erro quando o espaço do navegador acaba; quem chama avisa a pessoa.
  function gravar(dados) {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  }

  function apagar() {
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* sem armazenamento: nada a apagar */
    }
  }

  async function publicado() {
    const resp = await fetch(`${raiz}/demo/estoque.json`, { cache: "no-store" });
    return resp.json();
  }

  const esc = (texto) =>
    String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  function reais(centavos) {
    if (centavos == null) return "";
    const inteiro = Math.floor(centavos / 100);
    const resto = centavos % 100;
    return `R$ ${milhar(inteiro)}` + (resto ? `,${String(resto).padStart(2, "0")}` : "");
  }

  const km = (valor) => (valor == null ? "" : valor === 0 ? "0 km" : `${milhar(valor)} km`);
  const nome = (v) => `${v.marca} ${v.modelo}`;
  const titulo = (v) => `${nome(v)} ${v.versao || ""}`.trim();
  const ano = (v) => (v.ano_fabricacao === v.ano_modelo ? String(v.ano_modelo) : `${v.ano_fabricacao}/${v.ano_modelo}`);
  const foto = (caminho) => (caminho.startsWith("data:") ? caminho : raiz + caminho);
  const noSite = (v) => v.ativo && v.situacao !== "vendido";
  const linkVeiculo = (v) => `${raiz}/demo/veiculo/?id=${v.id}`;

  // Mesma ordem de consulta_estoque() no servidor: destaques, depois reservados por último, mais novos antes.
  function estoque(veiculos) {
    return veiculos
      .filter(noSite)
      .sort(
        (a, b) =>
          b.destaque - a.destaque ||
          (a.situacao === "reservado") - (b.situacao === "reservado") ||
          (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0)
      );
  }

  function selo(v) {
    if (v.situacao === "reservado") return '<span class="selo reservado">Reservado</span>';
    if (v.destaque) return '<span class="selo destaque">Destaque</span>';
    return "";
  }

  const precoHTML = (v) => (v.preco ? reais(v.preco) : '<span class="consulte">Consulte o preço</span>');

  function fichaCurta(v) {
    const itens = [ano(v), km(v.km), v.cambio, v.combustivel].filter(Boolean);
    return `<ul class="ficha-curta">${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }

  // Mesmo HTML do macro carro() em app/templates/_macros.html.
  function cartao(v, ordem) {
    const capa = v.fotos[0];
    return `
<a class="carro" href="${linkVeiculo(v)}" data-carro data-marca="${esc(v.marca)}" data-cambio="${esc(v.cambio)}"
   data-preco="${v.preco ?? ""}" data-ano="${v.ano_modelo}" data-km="${v.km ?? ""}" data-ordem="${ordem}"
   data-busca="${esc(`${titulo(v)} ${v.cor} ${ano(v)}`.toLowerCase())}">
  <div class="foto">
    ${capa ? `<img src="${esc(foto(capa))}" alt="${esc(`${titulo(v)} ${ano(v)}`)}" width="640" height="480" loading="lazy" decoding="async">` : '<span class="vazia">Foto em breve</span>'}
    ${selo(v)}
  </div>
  <div class="info">
    <h3>${esc(nome(v))}</h3>
    ${v.versao ? `<p class="versao">${esc(v.versao)}</p>` : ""}
    ${fichaCurta(v)}
    <div class="preco">${precoHTML(v)}</div>
  </div>
</a>`;
  }

  function linkWhatsapp(numero, texto) {
    const base = `https://wa.me/${String(numero).replace(/\D/g, "")}`;
    return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
  }

  window.RcarDemo = {
    CHAVE, raiz, SITUACOES, ler, gravar, apagar, publicado, esc, milhar, reais, km, nome, titulo, ano,
    foto, noSite, estoque, linkVeiculo, selo, precoHTML, fichaCurta, cartao, linkWhatsapp,
  };
})();
