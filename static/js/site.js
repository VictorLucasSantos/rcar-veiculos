/* Site: copiar número, galeria do veículo e filtro do estoque (no navegador, para valer também na cópia estática).
   Na cópia estática, com a demonstração do painel ativa (demo.js), o estoque vem do navegador. */
(async () => {
  "use strict";

  const toast = document.getElementById("toast");
  function show(texto) {
    toast.textContent = texto;
    toast.hidden = false;
    clearTimeout(show.t);
    show.t = setTimeout(() => (toast.hidden = true), 2000);
  }

  document.querySelectorAll("[data-copy]").forEach((botao) =>
    botao.addEventListener("click", async () => {
      const el = document.getElementById(botao.dataset.copy);
      try {
        await navigator.clipboard.writeText(el.textContent);
        show("Número copiado");
      } catch {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        show("Número selecionado");
      }
    })
  );

  // ---------------------------------------------------------------- demonstração do painel

  const D = window.RcarDemo;
  const demo = D && D.ler();

  if (demo) {
    // Página estática de um carro: os dados podem ter mudado no painel de demonstração.
    const estatico = document.querySelector("[data-veiculo-id]");
    if (estatico) {
      location.replace(`${D.raiz}/demo/veiculo/?id=${estatico.dataset.veiculoId}`);
      return;
    }
    const faixa = document.createElement("a");
    faixa.className = "demo-faixa";
    faixa.href = `${D.raiz}/admin/`;
    faixa.textContent = "Demonstração · abrir o painel";
    document.body.append(faixa);
    mostrarEstoqueDemo(demo);
  }

  const paginaDemo = document.querySelector("[data-demo-veiculo]");
  if (paginaDemo && D) await mostrarVeiculoDemo(paginaDemo, demo || (await D.publicado()));

  function mostrarEstoqueDemo(dados) {
    const carros = D.estoque(dados.veiculos);
    const botao = document.querySelector("[data-total-estoque]");
    if (botao) botao.textContent = carros.length === 1 ? "Ver o carro do estoque" : `Ver os ${carros.length} carros do estoque`;

    const vitrine = document.querySelector("[data-vitrine]");
    if (vitrine) {
      vitrine.innerHTML = carros.length
        ? `<div class="carros">${carros.slice(0, 6).map(D.cartao).join("")}</div>` +
          (carros.length > 6 ? `<div class="more"><a class="btn line sm" href="${D.raiz}/estoque/">Ver todo o estoque (${carros.length} carros)</a></div>` : "")
        : '<div class="vazio-estoque"><p>Nenhum carro no site agora. Cadastre um no painel de demonstração.</p></div>';
    }

    const lista = document.querySelector("[data-lista]");
    if (lista) {
      lista.innerHTML = carros.map(D.cartao).join("");
      const opcoes = (campo, valores, todos) => {
        const select = document.querySelector(`[data-filtro="${campo}"]`);
        if (select) select.innerHTML = `<option value="">${todos}</option>` + valores.map((v) => `<option>${D.esc(v)}</option>`).join("");
      };
      opcoes("marca", [...new Set(carros.map((c) => c.marca))].sort(), "Todas");
      opcoes("cambio", [...new Set(carros.map((c) => c.cambio).filter(Boolean))].sort(), "Todos");
    }
  }

  async function mostrarVeiculoDemo(alvo, dados) {
    const id = Number(new URLSearchParams(location.search).get("id"));
    const v = dados.veiculos.find((x) => x.id === id && D.noSite(x));
    if (!v) {
      alvo.innerHTML = `<div class="erro-pagina"><h1 class="cromo">Esse carro já foi entregue.</h1>
        <p>A página não existe mais ou o endereço está errado. O carro pode ter sido vendido.</p>
        <a class="btn red" href="${D.raiz}/estoque/">Ver o estoque</a></div>`;
      return;
    }
    const nomeCompleto = `${D.titulo(v)} ${D.ano(v)}`;
    document.title = `${nomeCompleto} · ${dados.loja.nome_loja}`;
    const mensagem = `Olá, ${dados.loja.nome_loja}! Tenho interesse no ${nomeCompleto}` + (v.preco ? ` (${D.reais(v.preco)})` : "") + `.\n${location.href}`;
    const ficha = [
      ["Ano", D.ano(v)], ["Quilometragem", D.km(v.km)], ["Câmbio", v.cambio], ["Combustível", v.combustivel],
      ["Cor", v.cor], ["Situação", D.SITUACOES[v.situacao]],
    ].filter(([, valor]) => valor);
    const opcionais = (v.opcionais || "").split("\n").map((o) => o.trim()).filter(Boolean);
    const capa = v.fotos[0];

    // Mesmo HTML de app/templates/loja/veiculo.html.
    alvo.innerHTML = `
<p class="migalha"><a href="${D.raiz}/estoque/">Estoque</a> / ${D.esc(D.nome(v))}</p>
<article class="veiculo">
  <div class="galeria" data-galeria>
    <figure class="principal">
      ${capa
        ? `<img src="${D.esc(D.foto(capa))}" alt="${D.esc(nomeCompleto)}, foto 1 de ${v.fotos.length}" width="1200" height="900" data-foto-principal>`
        : `<img src="${D.raiz}/static/img/showroom.jpg" alt="Salão da R-CAR" width="344" height="624" style="object-position:50% 38%">`}
      ${D.selo(v)}
    </figure>
    ${v.fotos.length > 1 ? `<div class="miniaturas" aria-label="Fotos">${v.fotos.map((f, i) => `
      <button type="button" data-foto="${D.esc(D.foto(f))}" data-alt="${D.esc(nomeCompleto)}, foto ${i + 1} de ${v.fotos.length}" ${i ? "" : 'aria-current="true"'} aria-label="Ver foto ${i + 1}">
        <img src="${D.esc(D.foto(f))}" alt="" loading="lazy" width="92" height="69"></button>`).join("")}</div>` : ""}
  </div>
  <div class="lado">
    <h1 class="cromo">${D.esc(D.nome(v))}</h1>
    ${v.versao ? `<p class="versao">${D.esc(v.versao)}</p>` : ""}
    <div class="preco">${D.precoHTML(v)}</div>
    <div class="acoes">
      <a class="btn red" href="${D.linkWhatsapp(dados.loja.whatsapp, mensagem)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#wa"/></svg>${v.situacao === "reservado" ? "Perguntar se ainda está reservado" : "Tenho interesse"}</a>
    </div>
    <dl class="ficha">${ficha.map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${D.esc(valor)}</dd>`).join("")}</dl>
  </div>
  ${v.descricao || opcionais.length ? `<div class="texto-veiculo">
    ${v.descricao ? `<div><h2 class="cromo">Sobre o carro</h2><p>${D.esc(v.descricao)}</p></div>` : ""}
    ${opcionais.length ? `<div><h2 class="cromo">Opcionais</h2><ul class="opcionais">${opcionais.map((o) => `<li>${D.esc(o)}</li>`).join("")}</ul></div>` : ""}
  </div>` : ""}
</article>`;
  }

  // ---------------------------------------------------------------- galeria e filtros

  const galeria = document.querySelector("[data-galeria]");
  if (galeria) {
    const principal = galeria.querySelector("[data-foto-principal]");
    galeria.querySelectorAll("[data-foto]").forEach((botao) =>
      botao.addEventListener("click", () => {
        principal.src = botao.dataset.foto;
        principal.alt = botao.dataset.alt;
        galeria.querySelectorAll("[data-foto]").forEach((b) => b.removeAttribute("aria-current"));
        botao.setAttribute("aria-current", "true");
      })
    );
  }

  const filtros = document.querySelector("[data-filtros]");
  if (filtros) {
    const lista = document.querySelector("[data-lista]");
    const carros = [...lista.querySelectorAll("[data-carro]")];
    const contagem = filtros.querySelector("[data-contagem]");
    const semResultado = document.querySelector("[data-sem-resultado]");
    const campo = (nome) => filtros.querySelector(`[data-filtro="${nome}"]`);
    const valor = (nome) => (campo(nome) ? campo(nome).value : "");
    const numero = (c, chave, vazio) => (c.dataset[chave] === "" ? vazio : Number(c.dataset[chave]));
    const ordens = {
      "": (a, b) => numero(a, "ordem", 0) - numero(b, "ordem", 0),
      "menor-preco": (a, b) => numero(a, "preco", Infinity) - numero(b, "preco", Infinity),
      "maior-preco": (a, b) => numero(b, "preco", -Infinity) - numero(a, "preco", -Infinity),
      "mais-novo": (a, b) => numero(b, "ano", 0) - numero(a, "ano", 0),
      "menor-km": (a, b) => numero(a, "km", Infinity) - numero(b, "km", Infinity),
    };

    function aplicar() {
      const termos = valor("busca").toLowerCase().split(/\s+/).filter(Boolean);
      const marca = valor("marca");
      const cambio = valor("cambio");
      let visiveis = 0;
      for (const c of carros) {
        const ok =
          (!marca || c.dataset.marca === marca) &&
          (!cambio || c.dataset.cambio === cambio) &&
          termos.every((t) => c.dataset.busca.includes(t));
        c.hidden = !ok;
        if (ok) visiveis++;
      }
      [...carros].sort(ordens[valor("ordem")] || ordens[""]).forEach((c) => lista.append(c));
      contagem.textContent = `${visiveis} carro${visiveis === 1 ? "" : "s"}`;
      semResultado.hidden = visiveis > 0;
    }

    filtros.addEventListener("input", aplicar);
    filtros.addEventListener("change", aplicar);
    if (demo) aplicar();
  }
})();
