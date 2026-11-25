/* Placa do vidro na demonstração do painel: pega o carro (?id=) do estoque guardado neste
   navegador (ou do publicado) e monta os mesmos dados de dados_placa() em app/servicos.py. */
(async () => {
  "use strict";

  const D = window.RcarDemo;
  const alvo = document.querySelector("[data-placa]");
  const id = Number(new URLSearchParams(location.search).get("id"));

  function telefone(numero) {
    let d = String(numero).replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return numero;
  }

  let dados = D.ler();
  if (!dados) dados = await D.publicado();
  const v = dados.veiculos.find((x) => x.id === id && !x.exemplo);
  if (!v) {
    alvo.innerHTML = '<p class="placa-aviso">Veículo não encontrado. Volte ao painel e abra a placa pela tela do carro.</p>';
    return;
  }

  // Carro publicado tem página própria no site (abre em qualquer celular); o criado só na
  // demonstração existe apenas neste navegador.
  const url = v.slug ? `${location.origin}${D.raiz}/veiculo/${v.slug}/` : `${location.origin}${D.linkVeiculo(v)}`;
  let aviso = null;
  if (!D.noSite(v)) aviso = "Este carro não aparece no site agora (vendido ou oculto): o QR vai abrir uma página que não existe.";
  else if (!v.slug) aviso = "Demonstração: este carro foi cadastrado só neste navegador, então o QR abre a página dele apenas aqui. No painel de verdade, abre em qualquer celular.";

  const desconto = D.desconto(v);
  const selo = v.situacao === "reservado" ? "Reservado" : desconto ? `Baixou ${D.descontoPct(v)}%` : v.destaque ? "Destaque" : "";
  document.title = `Placa · ${D.titulo(v)} ${D.ano(v)} · ${dados.loja.nome_loja}`;
  window.RcarPlaca.montar(alvo, {
    nome: D.nome(v),
    versao: v.versao,
    ficha: [D.ano(v), D.km(v.km), v.cambio, v.combustivel],
    preco: v.preco,
    preco_anterior: desconto ? v.preco_anterior : null,
    selo,
    situacao: v.situacao,
    opcionais: String(v.opcionais || "").split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 8),
    url,
    aviso,
    logo: `${D.raiz}/static/img/logo.png`,
    loja: {
      nome_loja: dados.loja.nome_loja,
      telefone: telefone(dados.loja.whatsapp),
      instagram: dados.loja.instagram || "",
      cidade: dados.loja.cidade,
    },
  });
})();
