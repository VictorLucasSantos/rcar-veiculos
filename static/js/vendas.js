/* Dashboard de vendas. Usado pelo painel real (/admin/vendas, dados embutidos na página) e pelo
   painel de demonstração (demo-admin.js chama RcarVendas.montar). Tudo é calculado aqui, no
   navegador, a partir da lista de veículos: vendidos (situação "vendido" com data) e estoque. */
(() => {
  "use strict";

  const COR = "#b08a3c"; // dourado do lustre um passo abaixo, validado contra o grafite (dataviz)
  const COR_REALCE = "#c9a24f";
  const SVG = "http://www.w3.org/2000/svg";
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const FAIXAS = [
    ["Até 50 mil", 0, 50000],
    ["50 a 80 mil", 50000, 80000],
    ["80 a 120 mil", 80000, 120000],
    ["120 a 200 mil", 120000, 200000],
    ["Acima de 200 mil", 200000, Infinity],
  ];

  // ---------------------------------------------------------------- formatação

  const milhar = (n) => Math.round(n).toLocaleString("pt-BR");
  const reais = (centavos) => `R$ ${milhar(centavos / 100)}`;
  function reaisCurto(centavos) {
    const v = centavos / 100;
    if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (v >= 1e3) return `R$ ${Math.round(v / 1e3)} mil`;
    return `R$ ${milhar(v)}`;
  }
  const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const dias = (de, ate) => Math.max(0, Math.round((new Date(ate) - new Date(de)) / 86400000));
  const titulo = (v) => `${v.marca} ${v.modelo} ${v.versao || ""}`.trim();
  // Valor da venda: o fechado com o cliente; sem ele, o preço anunciado.
  const valorVenda = (v) => v.preco_venda ?? v.preco ?? 0;
  const margem = (v) => valorVenda(v) - v.preco_compra;
  const ano = (v) => (v.ano_fabricacao === v.ano_modelo ? String(v.ano_modelo) : `${v.ano_fabricacao}/${v.ano_modelo}`);

  function chaveMes(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
  }

  function mesesDesde(inicio, fim) {
    const lista = [];
    const d = new Date(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, 1);
    while (chaveMes(d) <= fim) {
      lista.push(chaveMes(d));
      d.setMonth(d.getMonth() + 1);
    }
    return lista;
  }

  // Marcas do eixo: 0 e passos "redondos" (1, 2, 5 × 10ⁿ) até passar do maior valor.
  // Contagem de carros (inteiro) nunca usa passo menor que 1.
  function marcasEixo(maximo, inteiro, quantas = 4) {
    if (maximo <= 0) return [0, 1];
    const bruto = maximo / quantas;
    const base = 10 ** Math.floor(Math.log10(bruto));
    let passo = [1, 2, 5, 10].map((m) => m * base).find((p) => p >= bruto);
    if (inteiro) passo = Math.max(1, Math.round(passo));
    const lista = [];
    for (let v = 0; v <= maximo + passo * 0.001; v += passo) lista.push(v);
    if (lista[lista.length - 1] < maximo) lista.push(lista[lista.length - 1] + passo);
    return lista;
  }

  // ---------------------------------------------------------------- dicas (tooltip)

  let dica = null;
  function mostrarDica(evento, linhas) {
    if (!dica) {
      dica = document.createElement("div");
      dica.className = "dica-grafico";
      dica.setAttribute("role", "tooltip");
      document.body.append(dica);
    }
    dica.replaceChildren(
      ...linhas.map(([valor, rotulo], i) => {
        const linha = document.createElement("div");
        const forte = document.createElement(i === 0 ? "strong" : "span");
        forte.textContent = valor;
        linha.append(forte);
        if (rotulo) {
          const fraco = document.createElement("small");
          fraco.textContent = ` ${rotulo}`;
          linha.append(fraco);
        }
        return linha;
      })
    );
    dica.hidden = false;
    const caixa = evento.target.getBoundingClientRect ? evento.target.getBoundingClientRect() : null;
    const x = evento.clientX ?? (caixa ? caixa.left + caixa.width / 2 : 0);
    const y = evento.clientY ?? (caixa ? caixa.top : 0);
    const largura = dica.offsetWidth;
    dica.style.left = `${Math.min(Math.max(8, x - largura / 2), innerWidth - largura - 8)}px`;
    dica.style.top = `${Math.max(8, y - dica.offsetHeight - 12) + scrollY}px`;
  }
  const esconderDica = () => dica && (dica.hidden = true);

  function svg(nome, atributos = {}) {
    const el = document.createElementNS(SVG, nome);
    for (const [chave, valor] of Object.entries(atributos)) el.setAttribute(chave, valor);
    return el;
  }

  function texto(conteudo, atributos) {
    const el = svg("text", atributos);
    el.textContent = conteudo;
    return el;
  }

  // Coluna/barra com 4px arredondados na ponta e base reta.
  function caminhoBarra(x, y, largura, altura, horizontal) {
    const r = Math.min(4, horizontal ? largura : altura, horizontal ? altura / 2 : largura / 2);
    if (horizontal) {
      return `M${x},${y} h${largura - r} a${r},${r} 0 0 1 ${r},${r} v${altura - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(largura - r)} z`;
    }
    return `M${x},${y + altura} v${-(altura - r)} a${r},${r} 0 0 1 ${r},${-r} h${largura - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${altura - r} z`;
  }

  function ligarMarca(el, linhas) {
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", linhas.map((l) => l.filter(Boolean).join(" ")).join(", "));
    el.addEventListener("pointermove", (e) => mostrarDica(e, linhas));
    el.addEventListener("pointerleave", esconderDica);
    el.addEventListener("focus", (e) => mostrarDica(e, linhas));
    el.addEventListener("blur", esconderDica);
  }

  // ---------------------------------------------------------------- gráficos

  // Colunas verticais (uma série): dados = [{rotulo, valor, linhas}], formato(valor) para eixo e rótulo.
  function colunas(alvo, dados, formato) {
    const largura = Math.max(280, alvo.clientWidth);
    const altura = 220;
    const margem = { topo: 22, direita: 8, base: 26, esquerda: 64 };
    const area = { l: largura - margem.esquerda - margem.direita, a: altura - margem.topo - margem.base };
    const maximo = Math.max(0, ...dados.map((d) => d.valor));
    const marcas = marcasEixo(maximo, formato === milhar);
    const topo = marcas[marcas.length - 1];
    const y = (v) => margem.topo + area.a - (v / topo) * area.a;
    const faixa = area.l / Math.max(1, dados.length);
    const grossura = Math.min(24, faixa * 0.62);

    const el = svg("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: "img" });
    for (const m of marcas) {
      el.append(svg("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: y(m), y2: y(m), class: "grade" }));
      el.append(texto(formato(m), { x: margem.esquerda - 8, y: y(m) + 4, "text-anchor": "end", class: "eixo" }));
    }
    const passoRotulo = Math.ceil(dados.length / Math.floor(area.l / 52));
    const indiceMaior = dados.findIndex((d) => d.valor === maximo && maximo > 0);
    dados.forEach((d, i) => {
      const centro = margem.esquerda + faixa * i + faixa / 2;
      if (i % passoRotulo === 0) {
        el.append(texto(d.rotulo, { x: centro, y: altura - 8, "text-anchor": "middle", class: "eixo" }));
      }
      const alvoHover = svg("rect", { x: centro - faixa / 2, y: margem.topo, width: faixa, height: area.a, class: "alvo" });
      const h = y(0) - y(d.valor);
      const barra = h > 0 ? svg("path", { d: caminhoBarra(centro - grossura / 2, y(d.valor), grossura, h, false), fill: COR, class: "marca" }) : null;
      if (barra) el.append(barra);
      if (i === indiceMaior) {
        el.append(texto(formato(d.valor), { x: centro, y: y(d.valor) - 6, "text-anchor": "middle", class: "valor" }));
      }
      ligarMarca(alvoHover, d.linhas);
      alvoHover.addEventListener("pointerenter", () => barra && barra.setAttribute("fill", COR_REALCE));
      alvoHover.addEventListener("pointerleave", () => barra && barra.setAttribute("fill", COR));
      el.append(alvoHover);
    });
    el.append(svg("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: y(0), y2: y(0), class: "base" }));
    alvo.replaceChildren(el);
  }

  // Barras horizontais (uma série), valor na ponta.
  function barras(alvo, dados, formato) {
    const largura = Math.max(280, alvo.clientWidth);
    const linha = 30;
    const altura = Math.max(1, dados.length) * linha + 8;
    const rotuloL = Math.min(150, largura * 0.38);
    const area = largura - rotuloL - 70;
    const maximo = Math.max(1, ...dados.map((d) => d.valor));
    const el = svg("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: "img" });
    dados.forEach((d, i) => {
      const meio = 4 + i * linha + linha / 2;
      el.append(texto(d.rotulo, { x: rotuloL - 10, y: meio + 4, "text-anchor": "end", class: "rotulo" }));
      const w = (d.valor / maximo) * area;
      const barra = w > 0 ? svg("path", { d: caminhoBarra(rotuloL, meio - 9, w, 18, true), fill: COR, class: "marca" }) : null;
      if (barra) el.append(barra);
      el.append(texto(formato(d.valor), { x: rotuloL + w + 8, y: meio + 4, class: "valor" }));
      const alvoHover = svg("rect", { x: 0, y: meio - linha / 2, width: largura, height: linha, class: "alvo" });
      ligarMarca(alvoHover, d.linhas);
      alvoHover.addEventListener("pointerenter", () => barra && barra.setAttribute("fill", COR_REALCE));
      alvoHover.addEventListener("pointerleave", () => barra && barra.setAttribute("fill", COR));
      el.append(alvoHover);
    });
    el.append(svg("line", { x1: rotuloL, x2: rotuloL, y1: 0, y2: altura, class: "base" }));
    alvo.replaceChildren(el);
  }

  // ---------------------------------------------------------------- dashboard

  function el(tag, atributos = {}, filhos = []) {
    const no = document.createElement(tag);
    for (const [chave, valor] of Object.entries(atributos)) {
      if (chave === "texto") no.textContent = valor;
      else no.setAttribute(chave, valor);
    }
    no.append(...filhos);
    return no;
  }

  function tabela(cabecalho, linhas, direita = []) {
    return el("div", { class: "tabela-rolagem" }, [
      el("table", { class: "tabela" }, [
        el("thead", {}, [el("tr", {}, cabecalho.map((c, i) => el("th", { texto: c, ...(direita.includes(i) ? { class: "dir" } : {}) })))]),
        el("tbody", {}, linhas.map((l) => el("tr", {}, l.map((c, i) => el("td", { texto: c, ...(direita.includes(i) ? { class: "dir" } : {}) }))))),
      ]),
    ]);
  }

  function montar(alvo, veiculos) {
    const estado = { periodo: "12", marca: "", metrica: "quantidade" };
    const vendidosTodos = veiculos.filter((v) => v.situacao === "vendido" && v.vendido_em);
    const marcas = [...new Set(vendidosTodos.map((v) => v.marca))].sort();
    const exemplo = vendidosTodos.some((v) => v.exemplo);

    function desenhar() {
      const hoje = chaveMes(new Date());
      const primeiro = vendidosTodos.map((v) => v.vendido_em.slice(0, 7)).sort()[0] || hoje;
      let inicio = primeiro;
      if (estado.periodo !== "tudo") {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - Number(estado.periodo) + 1);
        inicio = chaveMes(d);
      }
      const daMarca = (v) => !estado.marca || v.marca === estado.marca;
      const vendidos = vendidosTodos
        .filter((v) => v.vendido_em.slice(0, 7) >= inicio && daMarca(v))
        .sort((a, b) => (a.vendido_em < b.vendido_em ? 1 : -1));
      const estoque = veiculos.filter((v) => v.ativo && v.situacao !== "vendido" && daMarca(v));
      const comPreco = vendidos.filter((v) => valorVenda(v));
      const faturamento = comPreco.reduce((s, v) => s + valorVenda(v), 0);
      const ticket = comPreco.length ? faturamento / comPreco.length : 0;
      // Margem só onde o custo foi informado; desconto na negociação só onde há anúncio e venda.
      const comCusto = comPreco.filter((v) => v.preco_compra);
      const lucro = comCusto.reduce((s, v) => s + margem(v), 0);
      const vendaComCusto = comCusto.reduce((s, v) => s + valorVenda(v), 0);
      const negociados = vendidos.filter((v) => v.preco && v.preco_venda);
      const descontoNegociacao = negociados.length
        ? negociados.reduce((s, v) => s + (v.preco - v.preco_venda) / v.preco, 0) / negociados.length
        : null;
      const tempoMedio = vendidos.length ? vendidos.reduce((s, v) => s + dias(v.criado_em, v.vendido_em), 0) / vendidos.length : 0;
      const valorEstoque = estoque.reduce((s, v) => s + (v.preco || 0), 0);
      const precoMedioEstoque = estoque.filter((v) => v.preco).length ? valorEstoque / estoque.filter((v) => v.preco).length : 0;

      // Por mês
      const meses = mesesDesde(inicio, hoje);
      const porMes = Object.fromEntries(meses.map((m) => [m, { quantidade: 0, faturamento: 0 }]));
      for (const v of vendidos) {
        const m = porMes[v.vendido_em.slice(0, 7)];
        if (!m) continue;
        m.quantidade++;
        m.faturamento += valorVenda(v) || 0;
      }

      // Por marca: as 7 maiores e o resto em "Outras"
      const somaMarca = {};
      for (const v of vendidos) {
        somaMarca[v.marca] ??= { quantidade: 0, faturamento: 0 };
        somaMarca[v.marca].quantidade++;
        somaMarca[v.marca].faturamento += valorVenda(v) || 0;
      }

      // Por origem do comprador (o que não foi informado vai por último)
      const somaOrigem = {};
      for (const v of vendidos) {
        const chave = v.origem_venda || "Não informado";
        somaOrigem[chave] ??= { quantidade: 0, faturamento: 0 };
        somaOrigem[chave].quantidade++;
        somaOrigem[chave].faturamento += valorVenda(v) || 0;
      }
      const porOrigem = Object.entries(somaOrigem).sort(
        (a, b) => (a[0] === "Não informado") - (b[0] === "Não informado") || b[1].quantidade - a[1].quantidade
      );
      let porMarca = Object.entries(somaMarca).sort((a, b) => b[1].quantidade - a[1].quantidade || b[1].faturamento - a[1].faturamento);
      if (porMarca.length > 8) {
        const resto = porMarca.slice(7).reduce((s, [, m]) => ({ quantidade: s.quantidade + m.quantidade, faturamento: s.faturamento + m.faturamento }), { quantidade: 0, faturamento: 0 });
        porMarca = [...porMarca.slice(0, 7), ["Outras", resto]];
      }

      // Por faixa de preço
      const porFaixa = FAIXAS.map(([rotulo, de, ate]) => {
        const lista = comPreco.filter((v) => valorVenda(v) / 100 >= de && valorVenda(v) / 100 < ate);
        return { rotulo, quantidade: lista.length, faturamento: lista.reduce((s, v) => s + valorVenda(v), 0) };
      });

      const metricaFat = estado.metrica === "faturamento";
      const plural = (n, um, varios) => `${milhar(n)} ${n === 1 ? um : varios}`;

      // ---- montagem
      const filtros = el("form", { class: "dash-filtros", "aria-label": "Filtros do dashboard" }, [
        el("label", {}, ["Período ", el("select", { class: "entrada", name: "periodo" }, [
          ["3", "Últimos 3 meses"], ["6", "Últimos 6 meses"], ["12", "Últimos 12 meses"], ["tudo", "Tudo"],
        ].map(([valor, rotulo]) => el("option", { value: valor, texto: rotulo, ...(estado.periodo === valor ? { selected: "" } : {}) })))]),
        el("label", {}, ["Marca ", el("select", { class: "entrada", name: "marca" }, [
          el("option", { value: "", texto: "Todas" }),
          ...marcas.map((m) => el("option", { value: m, texto: m, ...(estado.marca === m ? { selected: "" } : {}) })),
        ])]),
      ]);
      filtros.addEventListener("change", (e) => {
        estado[e.target.name] = e.target.value;
        desenhar();
      });

      const porcento = (x) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
      const mediaMes = (vendidos.length / meses.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      const kpi = (rotulo, valor, nota) => el("div", { class: "kpi" }, [el("span", { texto: rotulo }), el("b", { texto: valor }), el("small", { texto: nota })]);
      const kpis = el("div", { class: "kpis" }, [
        el("div", { class: "kpi heroi" }, [el("span", { texto: "Faturamento no período" }), el("b", { texto: reais(faturamento) }),
          el("small", { texto: `${plural(vendidos.length, "carro vendido", "carros vendidos")} em ${meses.length} ${meses.length === 1 ? "mês" : "meses"} · média de ${mediaMes} por mês` })]),
        kpi("Lucro bruto", comCusto.length ? reais(lucro) : "—",
          comCusto.length ? `margem de ${porcento(lucro / vendaComCusto)} sobre a venda · ${plural(comCusto.length, "carro", "carros")} com custo` : "informe o preço de compra na venda"),
        kpi("Margem média por carro", comCusto.length ? reais(lucro / comCusto.length) : "—", "venda menos compra"),
        kpi("Ticket médio", ticket ? reais(ticket) : "—", "valor médio de venda"),
        kpi("Desconto na negociação", descontoNegociacao == null ? "—" : porcento(descontoNegociacao),
          descontoNegociacao == null ? "informe o valor da venda" : "média entre anúncio e venda"),
        kpi("Tempo médio até vender", vendidos.length ? plural(Math.round(tempoMedio), "dia", "dias") : "—", "do cadastro à venda"),
        kpi("Estoque no site", reaisCurto(valorEstoque),
          `${plural(estoque.length, "carro", "carros")} · preço médio ${precoMedioEstoque ? reaisCurto(precoMedioEstoque) : "—"}`),
      ]);

      const alternar = el("div", { class: "alternar", role: "group", "aria-label": "Medida do gráfico" }, [
        ["quantidade", "Carros"], ["faturamento", "Faturamento"],
      ].map(([valor, rotulo]) => {
        const botao = el("button", { type: "button", texto: rotulo, "aria-pressed": String(estado.metrica === valor) });
        botao.addEventListener("click", () => {
          estado.metrica = valor;
          desenhar();
        });
        return botao;
      }));

      const grafMes = el("div", { class: "grafico" });
      const grafMarca = el("div", { class: "grafico" });
      const grafFaixa = el("div", { class: "grafico" });
      const grafOrigem = el("div", { class: "grafico" });

      const tabelaMes = el("details", { class: "ver-tabela" }, [
        el("summary", { texto: "Ver por mês em tabela" }),
        tabela(["Mês", "Carros", "Faturamento", "Ticket médio"],
          meses.map((m) => [rotuloMes(m), milhar(porMes[m].quantidade), reais(porMes[m].faturamento), porMes[m].quantidade ? reais(porMes[m].faturamento / porMes[m].quantidade) : "—"]),
          [1, 2, 3]),
      ]);

      const ultimas = vendidos.slice(0, 15).map((v) => [
        dataBR(v.vendido_em), titulo(v), ano(v),
        v.preco ? reais(v.preco) : "—",
        v.preco_venda ? reais(v.preco_venda) : "—",
        v.preco_compra && valorVenda(v) ? reais(margem(v)) : "—",
        v.origem_venda || "—",
        plural(dias(v.criado_em, v.vendido_em), "dia", "dias"),
      ]);

      alvo.replaceChildren(
        ...(exemplo ? [el("p", { class: "demo-aviso", texto: "Dados de exemplo: o histórico de vendas desta demonstração é fictício, gerado para mostrar o dashboard." })] : []),
        filtros,
        kpis,
        el("section", { class: "bloco" }, [
          el("h2", {}, [`${metricaFat ? "Faturamento" : "Carros vendidos"} por mês`, alternar]),
          grafMes,
          tabelaMes,
        ]),
        el("div", { class: "grade-graficos" }, [
          el("section", { class: "bloco" }, [el("h2", { texto: "Vendas por marca" }), grafMarca,
            el("details", { class: "ver-tabela" }, [el("summary", { texto: "Ver em tabela" }),
              tabela(["Marca", "Carros", "Faturamento"], porMarca.map(([m, d]) => [m, milhar(d.quantidade), reais(d.faturamento)]), [1, 2])])]),
          el("section", { class: "bloco" }, [el("h2", { texto: "Vendas por faixa de preço" }), grafFaixa,
            el("details", { class: "ver-tabela" }, [el("summary", { texto: "Ver em tabela" }),
              tabela(["Faixa", "Carros", "Faturamento"], porFaixa.map((f) => [f.rotulo, milhar(f.quantidade), reais(f.faturamento)]), [1, 2])])]),
        ]),
        el("section", { class: "bloco" }, [el("h2", { texto: "De onde vêm os compradores" }), grafOrigem,
          el("details", { class: "ver-tabela" }, [el("summary", { texto: "Ver em tabela" }),
            tabela(["Origem", "Carros", "Faturamento"], porOrigem.map(([o, d]) => [o, milhar(d.quantidade), reais(d.faturamento)]), [1, 2])])]),
        el("section", { class: "bloco" }, [
          el("h2", { texto: "Últimas vendas" }),
          ultimas.length ? tabela(["Data", "Veículo", "Ano", "Anunciado", "Vendido por", "Margem", "Origem", "Em estoque"], ultimas, [3, 4, 5, 7])
            : el("p", { class: "apagado", texto: "Nenhuma venda no período. Quando um carro é marcado como vendido, ele entra aqui." }),
        ]),
      );

      const pintar = () => {
        colunas(grafMes, meses.map((m) => ({
          rotulo: rotuloMes(m),
          valor: metricaFat ? porMes[m].faturamento : porMes[m].quantidade,
          linhas: [[metricaFat ? reais(porMes[m].faturamento) : plural(porMes[m].quantidade, "carro", "carros"), rotuloMes(m)],
            [metricaFat ? plural(porMes[m].quantidade, "carro", "carros") : reais(porMes[m].faturamento), metricaFat ? "vendidos" : "faturamento"]],
        })), metricaFat ? reaisCurto : milhar);
        barras(grafMarca, porMarca.map(([m, d]) => ({
          rotulo: m, valor: d.quantidade,
          linhas: [[plural(d.quantidade, "carro", "carros"), m], [reais(d.faturamento), "faturamento"]],
        })), milhar);
        colunas(grafFaixa, porFaixa.map((f) => ({
          rotulo: f.rotulo.replace(" mil", "").replace("Acima de ", "> ").replace("Até ", "< "),
          valor: f.quantidade,
          linhas: [[plural(f.quantidade, "carro", "carros"), f.rotulo], [reais(f.faturamento), "faturamento"]],
        })), milhar);
        barras(grafOrigem, porOrigem.map(([o, d]) => ({
          rotulo: o, valor: d.quantidade,
          linhas: [[plural(d.quantidade, "carro", "carros"), o], [reais(d.faturamento), "faturamento"]],
        })), milhar);
      };
      pintar();
      alvo._pintar = pintar;
    }

    desenhar();
    atual = alvo;
  }

  // Um só ouvinte de redimensionamento: redesenha os gráficos do dashboard aberto.
  let atual = null;
  let espera;
  addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => atual && atual.isConnected && atual._pintar(), 150);
  });

  window.RcarVendas = { montar };

  // Painel real: os veículos vêm embutidos na página.
  const auto = document.querySelector("[data-vendas]");
  const dadosAuto = document.querySelector("[data-veiculos]");
  if (auto && dadosAuto) montar(auto, JSON.parse(dadosAuto.textContent));
})();
