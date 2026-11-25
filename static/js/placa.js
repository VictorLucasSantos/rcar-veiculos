/* Placa para o vidro do carro no salão (A4, para imprimir), com QR code que abre a página do
   carro no site. Usada pelo painel (admin/placa.html, dados de dados_placa() em app/servicos.py)
   e pela demonstração (demo/placa.html, dados montados do estoque guardado no navegador).
   O QR é desenhado com qrcode-generator (window.qrcode), carregado antes deste arquivo. */
(() => {
  "use strict";

  const esc = (texto) =>
    String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  function reais(centavos) {
    const inteiro = Math.floor(centavos / 100);
    const resto = centavos % 100;
    return `R$ ${milhar(inteiro)}` + (resto ? `,${String(resto).padStart(2, "0")}` : "");
  }

  // QR em SVG: um caminho só, com 4 módulos de margem branca (a "zona quieta" que a câmera precisa).
  function qrSVG(texto) {
    const qr = window.qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const margem = 4;
    let caminho = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) caminho += `M${x + margem} ${y + margem}h1v1h-1z`;
      }
    }
    const lado = n + 2 * margem;
    return `<svg viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="QR code da página do carro">
<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
  }

  function precoHTML(d) {
    if (!d.preco) return '<p class="placa-preco"><span class="por">Consulte o preço</span></p>';
    if (!d.preco_anterior || d.preco_anterior <= d.preco) return `<p class="placa-preco"><span class="por">${reais(d.preco)}</span></p>`;
    return `<p class="placa-preco">
  <span class="de">De <s>${reais(d.preco_anterior)}</s> por</span>
  <span class="por">${reais(d.preco)}</span>
  <span class="economia">${reais(d.preco_anterior - d.preco)} a menos</span>
</p>`;
  }

  function montar(alvo, d) {
    if (!alvo || !d) return;
    if (!window.qrcode) {
      alvo.innerHTML = '<p class="placa-aviso">Não deu para carregar o gerador de QR code. Confira a internet e recarregue a página.</p>';
      return;
    }
    const ficha = d.ficha.filter(Boolean);
    const opcionais = (d.opcionais || []).slice(0, 8);
    const contato = [d.loja.telefone && `WhatsApp ${d.loja.telefone}`, d.loja.instagram && `@${d.loja.instagram}`, d.loja.cidade]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
    alvo.innerHTML = `
${d.aviso ? `<p class="placa-aviso tela">${esc(d.aviso)}</p>` : ""}
<article class="placa">
  <header class="placa-topo">
    <img src="${esc(d.logo)}" alt="${esc(d.loja.nome_loja || "Logo da loja")}">
    ${d.selo ? `<span class="placa-selo ${d.situacao === "reservado" ? "reservado" : ""}">${esc(d.selo)}</span>` : ""}
  </header>
  <div class="placa-nome">
    <h1>${esc(d.nome)}</h1>
    ${d.versao ? `<p class="versao">${esc(d.versao)}</p>` : ""}
    ${ficha.length ? `<ul class="placa-ficha">${ficha.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
  </div>
  <div class="placa-corpo">
    <div class="placa-info">
      ${precoHTML(d)}
      ${opcionais.length ? `<h2>Opcionais</h2><ul class="placa-opcionais">${opcionais.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
    </div>
    <figure class="placa-qr">
      ${qrSVG(d.url)}
      <figcaption><strong>Aponte a câmera do celular</strong>fotos, ficha completa e WhatsApp</figcaption>
      <p class="placa-url">${esc(d.url.replace(/^https?:\/\//, ""))}</p>
    </figure>
  </div>
  <footer class="placa-rodape">${contato}</footer>
</article>`;
  }

  // Páginas de placa: dados no próprio HTML (painel) ou entregues por quem chama (demonstração).
  const embutido = document.querySelector("[data-placa-dados]");
  if (embutido) {
    const iniciar = () => montar(document.querySelector("[data-placa]"), JSON.parse(embutido.textContent));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-imprimir]")) window.print();
  });

  window.RcarPlaca = { montar };
})();
