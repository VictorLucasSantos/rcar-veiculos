/* Painel de demonstração da cópia estática (GitHub Pages). Repete as telas e as regras do painel
   real (app/rotas_admin.py e app/templates/admin), mas guarda o estoque no localStorage deste
   navegador via demo.js. Nada é enviado a servidor. */
(() => {
  "use strict";

  const D = window.RcarDemo;
  const esc = D.esc;
  const LISTAS = JSON.parse(document.querySelector("[data-listas]").textContent);
  const app = document.querySelector("[data-app]");
  const telaLogin = document.querySelector("[data-login]");
  const painel = document.querySelector("[data-painel]");
  const ENTROU = "rcar-demo-entrou";

  let dados = null;
  let aviso = "";

  // ---------------------------------------------------------------- dados

  function salvar() {
    try {
      D.gravar(dados);
      return true;
    } catch {
      alert("O espaço da demonstração neste navegador acabou. Apague algumas fotos ou use “Restaurar estoque”.");
      return false;
    }
  }

  async function carregar(recomecar = false) {
    const publicado = await D.publicado();
    const salvo = recomecar ? null : D.ler();
    // Uma cópia nova do site (outra versão) recomeça a demonstração com o estoque publicado.
    dados = salvo && salvo.versao === publicado.versao ? salvo : publicado;
    if (dados === publicado) salvar();
  }

  const veiculo = (id) => dados.veiculos.find((v) => v.id === id);
  const agora = () => new Date().toISOString().slice(0, 19);

  // Mesma regra de mudar_situacao() em app/servicos.py.
  function mudarSituacao(v, nova) {
    if (nova === "vendido" && v.situacao !== "vendido") v.vendido_em = agora();
    else if (nova !== "vendido") v.vendido_em = null;
    v.situacao = nova;
  }

  const soDigitos = (texto) => String(texto || "").replace(/\D/g, "");
  const lerInteiro = (texto) => (soDigitos(texto) ? Number(soDigitos(texto)) : null);

  // Mesma regra de ler_centavos() em app/servicos.py.
  function lerCentavos(texto) {
    texto = String(texto || "").replace("R$", "").replace(/\s/g, "");
    if (!texto) return null;
    if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, "");
    const valor = Math.round(Number(texto) * 100);
    if (Number.isNaN(valor)) throw new Error(`Preço inválido: ${texto}`);
    if (valor < 0) throw new Error("Preço não pode ser negativo");
    return valor;
  }

  // Mesma regra de definir_preco() em app/servicos.py. Devolve true quando o "De" foi preenchido sozinho.
  function definirPreco(v, novo, de, existente) {
    if (de != null) {
      if (novo == null || de <= novo) throw new Error("O preço “De” precisa ser maior que o preço atual.");
      v.preco = novo;
      v.preco_anterior = de;
      return false;
    }
    const automatico = existente && v.preco_anterior == null && v.preco != null && novo != null && novo < v.preco;
    v.preco_anterior = automatico ? v.preco : null;
    v.preco = novo;
    return automatico;
  }

  // Mesma validação de _aplicar_dados() em app/rotas_admin.py. Devolve true quando o "De" foi automático.
  function aplicarFormulario(v, form, existente) {
    const campo = (nome) => String(form.elements[nome]?.value ?? "").trim();
    const marca = campo("marca");
    const modelo = campo("modelo");
    if (!marca || !modelo) throw new Error("Informe a marca e o modelo.");
    const limite = new Date().getFullYear() + 1;
    const lerAno = (nome, rotulo) => {
      const ano = lerInteiro(campo(nome));
      if (ano == null || ano < 1950 || ano > limite) throw new Error(`Informe o ${rotulo} entre 1950 e ${limite}.`);
      return ano;
    };
    const fabricacao = lerAno("ano_fabricacao", "ano de fabricação");
    const anoModelo = lerAno("ano_modelo", "ano do modelo");
    if (anoModelo < fabricacao || anoModelo > fabricacao + 1) {
      throw new Error("O ano do modelo deve ser igual ao de fabricação ou o seguinte.");
    }
    const origem = campo("origem_venda");
    if (origem && !LISTAS.origens.includes(origem)) throw new Error("Escolha de onde veio o comprador.");
    const preco = lerCentavos(campo("preco"));
    const de = lerCentavos(campo("preco_anterior"));
    const compra = lerCentavos(campo("preco_compra"));
    const venda = lerCentavos(campo("preco_venda"));
    const automatico = definirPreco(v, preco, de, existente);
    Object.assign(v, {
      preco_compra: compra,
      preco_venda: venda,
      origem_venda: origem,
      marca: marca.slice(0, 40),
      modelo: modelo.slice(0, 60),
      versao: campo("versao").slice(0, 80),
      ano_fabricacao: fabricacao,
      ano_modelo: anoModelo,
      km: lerInteiro(campo("km")),
      cambio: campo("cambio"),
      combustivel: campo("combustivel"),
      cor: campo("cor").slice(0, 30),
      descricao: campo("descricao"),
      opcionais: campo("opcionais").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
      ativo: form.elements.ativo.checked,
      destaque: form.elements.destaque.checked,
    });
    mudarSituacao(v, campo("situacao"));
    return automatico;
  }

  function reduzirFoto(arquivo) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1000 / Math.max(img.width, img.height));
        const tela = document.createElement("canvas");
        tela.width = Math.round(img.width * escala);
        tela.height = Math.round(img.height * escala);
        tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
        URL.revokeObjectURL(url);
        ok(tela.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        falha(new Error(`${arquivo.name}: não é uma imagem válida (use JPG, PNG ou WebP)`));
      };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- telas

  function avisoHTML() {
    if (!aviso) return "";
    const html = `<p class="aviso" role="status">${esc(aviso)}</p>`;
    aviso = "";
    return html;
  }

  function contagem() {
    const total = { disponivel: 0, reservado: 0, vendido: 0 };
    dados.veiculos.forEach((v) => total[v.situacao]++);
    return total;
  }

  function seletorSituacao(v) {
    return `<form class="troca-situacao"><label class="sr" for="sit-${v.id}">Situação de ${esc(D.titulo(v))}</label>
      <select class="entrada situacao-${v.situacao}" id="sit-${v.id}" data-situacao="${v.id}">
        ${Object.entries(D.SITUACOES).map(([chave, rotulo]) => `<option value="${chave}" ${v.situacao === chave ? "selected" : ""}>${rotulo}</option>`).join("")}
      </select></form>`;
  }

  // Mesma tabela de app/templates/admin/_tabela.html.
  function tabela(linhas) {
    return `<div class="tabela-rolagem"><table class="tabela">
      <thead><tr><th></th><th>Veículo</th><th>Ano</th><th class="dir">Km</th><th class="dir">Preço</th><th>Situação</th></tr></thead>
      <tbody>${linhas.map((v) => `
        <tr ${v.ativo ? "" : 'class="oculto"'}>
          <td class="col-foto">${v.fotos[0] ? `<img class="mini" src="${esc(D.foto(v.fotos[0]))}" alt="" loading="lazy">` : '<span class="mini vazia">sem foto</span>'}</td>
          <td><a href="#/veiculos/${v.id}">${esc(D.nome(v))}</a>
            <br><small class="apagado">${esc(v.versao || "sem versão")}${v.cor ? ` · ${esc(v.cor)}` : ""}</small>
            ${!v.ativo ? '<span class="etiqueta">fora do site</span>' : v.destaque ? '<span class="etiqueta destaque">destaque</span>' : ""}</td>
          <td>${D.ano(v)}</td>
          <td class="dir">${D.km(v.km) || "—"}</td>
          <td class="dir">${D.reais(v.preco) || "Consulte"}${D.desconto(v) ? `<br><small class="etiqueta destaque">−${D.descontoPct(v)}%</small>` : ""}</td>
          <td>${seletorSituacao(v)}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
  }

  const maisNovos = (a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0);

  function telaInicio() {
    const total = contagem();
    const inicioMes = agora().slice(0, 8) + "01";
    const vendidosMes = dados.veiculos.filter((v) => v.situacao === "vendido" && v.vendido_em && v.vendido_em >= inicioMes).length;
    const noSite = dados.veiculos.filter(D.noSite).sort(maisNovos);
    const semFoto = noSite.filter((v) => !v.fotos.length);
    return `
<div class="painel-cabeca"><h1>Olá, R-CAR</h1>
  <div class="acoes"><a class="btn red sm" href="#/veiculos/novo">+ Cadastrar veículo</a></div></div>
${avisoHTML()}
${semFoto.length ? `<p class="aviso atencao">${semFoto.length} veículo${semFoto.length === 1 ? "" : "s"} no site sem foto:
  ${semFoto.slice(0, 8).map((v) => `<a href="#/veiculos/${v.id}">${esc(D.titulo(v))}</a>`).join(", ")}${semFoto.length > 8 ? " e outros" : ""}.</p>` : ""}
${noSite.filter(fichaIncompleta).length ? `<p class="aviso atencao">${noSite.filter(fichaIncompleta).length} carros no site sem km, câmbio ou combustível. <a href="#/fichas">Completar fichas</a></p>` : ""}
<div class="resumo">
  <a href="#/veiculos?situacao=disponivel"><span>Disponíveis</span><b>${total.disponivel}</b></a>
  <a href="#/veiculos?situacao=reservado"><span>Reservados</span><b>${total.reservado}</b></a>
  <a href="#/veiculos?situacao=vendido"><span>Vendidos este mês</span><b>${vendidosMes}</b></a>
</div>
<section class="bloco">
  <h2>No site agora <small><a href="#/veiculos">Ver todos</a></small></h2>
  ${noSite.length ? tabela(noSite) : '<p class="apagado">Nenhum veículo aparecendo no site. Cadastre o primeiro em “Cadastrar veículo”.</p>'}
</section>`;
  }

  function telaVeiculos(parametros) {
    const situacao = parametros.get("situacao") || "";
    const q = (parametros.get("q") || "").trim();
    const total = contagem();
    let lista = [...dados.veiculos].sort(maisNovos);
    if (D.SITUACOES[situacao]) lista = lista.filter((v) => v.situacao === situacao);
    if (q) {
      const termo = q.toLowerCase();
      lista = lista.filter((v) => `${v.marca} ${v.modelo} ${v.versao}`.toLowerCase().includes(termo));
    }
    const busca = q ? `&q=${encodeURIComponent(q)}` : "";
    const filtro = (chave, rotulo, n) =>
      `<a href="#/veiculos?situacao=${chave}${busca}" ${situacao === chave ? 'aria-current="true"' : ""}>${rotulo} <span>${n}</span></a>`;
    return `
<div class="painel-cabeca"><h1>Veículos</h1>
  <div class="acoes"><a class="btn line sm" href="#/fichas">Completar fichas</a><a class="btn red sm" href="#/veiculos/novo">+ Cadastrar veículo</a></div></div>
${avisoHTML()}
<section class="bloco">
  <nav class="filtro-situacao" aria-label="Filtrar por situação">
    ${filtro("", "Todos", dados.veiculos.length)}
    ${Object.entries(D.SITUACOES).map(([chave, rotulo]) => filtro(chave, rotulo, total[chave])).join("")}
  </nav>
  <form class="busca-adm" data-busca>
    <label class="sr" for="q">Buscar</label>
    <input class="entrada" id="q" type="search" name="q" value="${esc(q)}" placeholder="Buscar por marca, modelo ou versão">
    <button class="btn line sm" type="submit">Buscar</button>
  </form>
  ${lista.length ? tabela(lista) : `<p class="apagado">${q ? `Nenhum veículo com “${esc(q)}”.` : situacao ? `Nenhum veículo ${D.SITUACOES[situacao].toLowerCase()}.` : "Nenhum veículo cadastrado ainda."}</p>`}
</section>`;
  }

  const fichaIncompleta = (v) => v.km == null || !v.cambio || !v.combustivel;

  function telefone(numero) {
    let d = String(numero).replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return numero;
  }

  // Mesmos dados de dados_arte() em app/servicos.py.
  function dadosArte(v) {
    const selo = v.situacao === "reservado" ? "Reservado" : D.desconto(v) ? `Baixou ${D.descontoPct(v)}%` : v.destaque ? "Destaque" : "";
    const capa = v.fotos[0];
    return {
      nome: D.nome(v),
      versao: v.versao,
      ano: D.ano(v),
      ficha: [D.ano(v), D.km(v.km), v.cambio, v.combustivel],
      preco: v.preco,
      preco_anterior: D.desconto(v) ? v.preco_anterior : null,
      selo,
      oferta: Boolean(D.desconto(v)) && v.situacao !== "reservado",
      foto: capa ? D.foto(capa) : null,
      ilustrativa: Boolean(capa && D.credito(v, capa)),
      logo: `${D.raiz}/static/img/logo.png`,
      loja: { telefone: telefone(dados.loja.whatsapp), instagram: dados.loja.instagram || "", endereco: dados.loja.cidade },
    };
  }

  // Mesma tabela de app/templates/admin/fichas.html.
  function telaFichas(parametros) {
    const todas = parametros.get("todas") === "1";
    const estoque = dados.veiculos
      .filter((v) => v.situacao !== "vendido")
      .sort((a, b) => `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`) || a.ano_modelo - b.ano_modelo);
    const incompletos = estoque.filter(fichaIncompleta);
    const lista = todas ? estoque : incompletos;
    const opcoes = (valores, atual) => '<option value="">—</option>' + valores.map((o) => `<option ${o === atual ? "selected" : ""}>${esc(o)}</option>`).join("");
    return `
<div class="painel-cabeca"><h1>Completar fichas</h1>
  <div class="acoes"><a class="btn line sm" href="#/veiculos">Voltar</a></div></div>
${avisoHTML()}
<section class="bloco">
  <nav class="filtro-situacao" aria-label="Quais carros">
    <a href="#/fichas" ${todas ? "" : 'aria-current="true"'}>Incompletas <span>${incompletos.length}</span></a>
    <a href="#/fichas?todas=1" ${todas ? 'aria-current="true"' : ""}>Todos no estoque</a>
  </nav>
  <p class="apagado">Ficha incompleta é a que está sem km, câmbio ou combustível. Preencha o que souber e salve tudo de uma vez; o que ficar vazio continua vazio. O preço de compra só aparece no painel.</p>
  ${lista.length ? `<form data-fichas>
    <div class="tabela-rolagem"><table class="tabela fichas">
      <thead><tr><th>Veículo</th><th>Versão</th><th>Km</th><th>Câmbio</th><th>Combustível</th><th>Cor</th><th>Preço de compra</th></tr></thead>
      <tbody>${lista.map((v) => {
        const rotulo = esc(`${D.nome(v)} ${D.ano(v)}`);
        return `<tr data-ficha="${v.id}">
          <td><a href="#/veiculos/${v.id}">${esc(D.nome(v))}</a><br><small class="apagado">${D.ano(v)} · ${D.reais(v.preco) || "Consulte"}</small></td>
          <td><input class="entrada" name="versao" value="${esc(v.versao)}" maxlength="80" placeholder="1.0 LT" aria-label="Versão de ${rotulo}"></td>
          <td><input class="entrada" name="km" value="${v.km != null ? D.milhar(v.km) : ""}" inputmode="numeric" placeholder="45.000" aria-label="Km de ${rotulo}"></td>
          <td><select class="entrada" name="cambio" aria-label="Câmbio de ${rotulo}">${opcoes(LISTAS.cambios, v.cambio)}</select></td>
          <td><select class="entrada" name="combustivel" aria-label="Combustível de ${rotulo}">${opcoes(LISTAS.combustiveis, v.combustivel)}</select></td>
          <td><input class="entrada" name="cor" value="${esc(v.cor)}" maxlength="30" placeholder="Branco" aria-label="Cor de ${rotulo}"></td>
          <td><input class="entrada" name="preco_compra" value="${v.preco_compra ? D.reais(v.preco_compra).slice(3) : ""}" inputmode="decimal" placeholder="75.000" aria-label="Preço de compra de ${rotulo}"></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
    <p class="rodape-form"><button class="btn red sm" type="submit">Salvar todas</button></p>
  </form>` : '<p class="apagado">Todas as fichas do estoque estão completas.</p>'}
</section>`;
  }

  // Mesmo formulário de app/templates/admin/veiculo_form.html.
  function telaFormulario(v, erro = "", rascunho = null) {
    const val = (campo, padrao) => esc(rascunho ? rascunho[campo] ?? "" : padrao ?? "");
    const opcoes = (lista, atual, vazio = true) =>
      (vazio ? '<option value="">Não informar</option>' : "") + lista.map((o) => `<option ${o === atual ? "selected" : ""}>${esc(o)}</option>`).join("");
    const atual = (campo, padrao) => (rascunho ? rascunho[campo] : padrao);
    const marcado = (campo, padrao) => ((rascunho ? rascunho[campo] : padrao) ? "checked" : "");
    const anoAtual = new Date().getFullYear();
    return `
<div class="painel-cabeca">
  <h1>${v ? esc(`${D.titulo(v)} ${D.ano(v)}`) : "Cadastrar veículo"}</h1>
  <div class="acoes">
    <a class="btn line sm" href="#/veiculos">Voltar</a>
    ${v && D.noSite(v) ? `<a class="btn line sm" href="${D.linkVeiculo(v)}" target="_blank" rel="noopener">Ver no site ↗</a>` : ""}
  </div>
</div>
${avisoHTML()}
${erro ? `<p class="aviso erro" role="alert">${esc(erro)}</p>` : ""}
${v && !D.noSite(v) ? `<p class="aviso atencao">Este veículo não aparece no site (${v.situacao === "vendido" ? "vendido" : "marcado para não mostrar"}).</p>` : ""}
<form class="bloco" data-veiculo="${v ? v.id : "novo"}">
  <h2>Dados do veículo</h2>
  <div class="form-grade">
    <label class="campo"><span>Marca</span>
      <input class="entrada" name="marca" required maxlength="40" list="marcas" value="${val("marca", v?.marca)}" placeholder="Chevrolet">
      <datalist id="marcas">${LISTAS.marcas.map((m) => `<option value="${esc(m)}">`).join("")}</datalist></label>
    <label class="campo"><span>Modelo</span>
      <input class="entrada" name="modelo" required maxlength="60" value="${val("modelo", v?.modelo)}" placeholder="Onix"></label>
    <label class="campo inteiro"><span>Versão <small>(opcional)</small></span>
      <input class="entrada" name="versao" maxlength="80" value="${val("versao", v?.versao)}" placeholder="1.0 Turbo LTZ"></label>
    <label class="campo"><span>Ano de fabricação</span>
      <input class="entrada" name="ano_fabricacao" required inputmode="numeric" maxlength="4" value="${val("ano_fabricacao", v?.ano_fabricacao)}" placeholder="${anoAtual - 2}"></label>
    <label class="campo"><span>Ano do modelo</span>
      <input class="entrada" name="ano_modelo" required inputmode="numeric" maxlength="4" value="${val("ano_modelo", v?.ano_modelo)}" placeholder="${anoAtual - 1}"></label>
    <label class="campo"><span>Quilometragem</span>
      <input class="entrada" name="km" inputmode="numeric" value="${val("km", v && v.km != null ? D.milhar(v.km) : "")}" placeholder="45.000"></label>
    <label class="campo"><span>Preço <small>(vazio = “Consulte o preço”)</small></span>
      <input class="entrada" name="preco" inputmode="decimal" value="${val("preco", v?.preco ? D.reais(v.preco).slice(3) : "")}" placeholder="89.900"></label>
    <label class="campo"><span>Preço “De” <small>(oferta: o site mostra “De … por …”)</small></span>
      <input class="entrada" name="preco_anterior" inputmode="decimal" value="${val("preco_anterior", v?.preco_anterior ? D.reais(v.preco_anterior).slice(3) : "")}" placeholder="${v ? "Preenchido sozinho quando o preço baixa" : "97.000"}">
      <small>Use só um preço que o carro teve de verdade. Ao baixar o preço, o antigo entra aqui sozinho.</small></label>
    <label class="campo"><span>Câmbio</span>
      <select class="entrada" name="cambio">${opcoes(LISTAS.cambios, atual("cambio", v?.cambio))}</select></label>
    <label class="campo"><span>Combustível</span>
      <select class="entrada" name="combustivel">${opcoes(LISTAS.combustiveis, atual("combustivel", v ? v.combustivel : "Flex"))}</select></label>
    <label class="campo"><span>Cor</span>
      <input class="entrada" name="cor" maxlength="30" value="${val("cor", v?.cor)}" placeholder="Branco"></label>
    <label class="campo"><span>Situação</span>
      <select class="entrada" name="situacao">${Object.entries(D.SITUACOES).map(([chave, rotulo]) =>
        `<option value="${chave}" ${atual("situacao", v ? v.situacao : "disponivel") === chave ? "selected" : ""}>${rotulo}</option>`).join("")}</select>
      <small>Vendido sai do site, mas continua aqui no painel.</small></label>
    <div class="campo inteiro">
      <span>No site</span>
      <label class="marcar"><input type="checkbox" name="ativo" ${marcado("ativo", v ? v.ativo : true)}> Mostrar no site</label>
      <label class="marcar"><input type="checkbox" name="destaque" ${marcado("destaque", v?.destaque)}> Destaque <small>(aparece primeiro, com selo vermelho)</small></label>
    </div>
    <label class="campo"><span>Opcionais <small>(um por linha)</small></span>
      <textarea class="entrada" name="opcionais" rows="7" placeholder="Ar-condicionado&#10;Direção elétrica&#10;Central multimídia&#10;Câmera de ré">${val("opcionais", v?.opcionais)}</textarea></label>
    <label class="campo"><span>Descrição</span>
      <textarea class="entrada" name="descricao" rows="7" placeholder="Único dono, revisões na concessionária, pneus novos…">${val("descricao", v?.descricao)}</textarea></label>
    <div class="subtitulo-form inteiro" id="venda">
      <h3>Custo e venda</h3>
      <p>Só aparece aqui no painel. Alimenta a margem e o dashboard de vendas.</p>
    </div>
    <label class="campo"><span>Preço de compra <small>(quanto a loja pagou)</small></span>
      <input class="entrada" name="preco_compra" inputmode="decimal" value="${val("preco_compra", v?.preco_compra ? D.reais(v.preco_compra).slice(3) : "")}" placeholder="75.000"></label>
    <label class="campo"><span>Valor da venda <small>(fechado com o cliente)</small></span>
      <input class="entrada" name="preco_venda" inputmode="decimal" value="${val("preco_venda", v?.preco_venda ? D.reais(v.preco_venda).slice(3) : "")}" placeholder="${v?.preco ? D.reais(v.preco).slice(3) : "86.000"}">
      ${v?.preco_venda && v?.preco_compra ? `<small>Margem: ${D.reais(v.preco_venda - v.preco_compra)} (${((100 * (v.preco_venda - v.preco_compra)) / v.preco_venda).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da venda)</small>` : ""}</label>
    <label class="campo"><span>De onde veio o comprador</span>
      <select class="entrada" name="origem_venda"><option value="">Não informar</option>${LISTAS.origens.map((o) =>
        `<option ${atual("origem_venda", v?.origem_venda) === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
  </div>
  <p class="rodape-form"><button class="btn red sm" type="submit">${v ? "Salvar dados" : "Cadastrar e enviar fotos"}</button></p>
</form>
${v ? `
<section class="bloco" id="fotos">
  <h2>Fotos <small>A primeira é a capa. Fotos deitadas (4:3) ficam melhores.</small></h2>
  ${v.fotos.length ? `<div class="fotos-adm">${v.fotos.map((f, i) => `
    <figure>
      <img src="${esc(D.foto(f))}" alt="Foto ${i + 1}" loading="lazy">
      <figcaption>
        ${i ? `<button class="btn line sm" type="button" data-capa="${i}">Usar como capa</button>` : '<span class="etiqueta destaque">capa</span>'}
        <button class="btn perigo sm" type="button" data-apagar-foto="${i}">Apagar</button>
      </figcaption>
    </figure>`).join("")}</div>` : '<p class="aviso atencao">Este veículo ainda não tem foto. No site ele aparece com “Foto em breve”.</p>'}
  <form class="envio-fotos" data-fotos>
    <label class="sr" for="fotos-arquivo">Escolher fotos</label>
    <input id="fotos-arquivo" type="file" name="fotos" accept="image/jpeg,image/png,image/webp" multiple required>
    <button class="btn red sm" type="submit">Enviar fotos</button>
  </form>
</section>
<section class="bloco" id="arte">
  <h2>Arte para Instagram <small>Story ou feed com foto, preço e WhatsApp. Gerada aqui no navegador.</small></h2>
  <div class="arte" data-arte-demo><p class="apagado">Carregando a prévia…</p></div>
</section>
<section class="bloco">
  <h2>Apagar veículo</h2>
  <p class="apagado">Vendeu? Marque como “Vendido”: ele sai do site e entra na conta do mês. Apagar remove o cadastro e as fotos de vez.</p>
  <button class="btn perigo sm" type="button" data-apagar-veiculo>Apagar veículo</button>
</section>` : ""}`;
  }

  // ---------------------------------------------------------------- navegação

  function rota() {
    const [caminho, consulta = ""] = location.hash.replace(/^#/, "").split("?");
    return { partes: caminho.split("/").filter(Boolean), parametros: new URLSearchParams(consulta) };
  }

  let veiculoAberto = null;

  function desenhar() {
    const { partes, parametros } = rota();
    veiculoAberto = null;
    let secao = "inicio";
    if (partes[0] === "fichas") {
      secao = "veiculos";
      app.innerHTML = telaFichas(parametros);
    } else if (partes[0] === "vendas") {
      secao = "vendas";
      app.innerHTML = '<div class="painel-cabeca"><h1>Vendas</h1></div><div class="dashboard" data-dashboard></div>';
      window.RcarVendas.montar(app.querySelector("[data-dashboard]"), dados.veiculos);
    } else if (partes[0] === "veiculos") {
      secao = "veiculos";
      if (partes[1] === "novo") app.innerHTML = telaFormulario(null);
      else if (partes[1]) {
        veiculoAberto = veiculo(Number(partes[1]));
        app.innerHTML = veiculoAberto ? telaFormulario(veiculoAberto) : '<p class="aviso erro">Veículo não encontrado.</p>';
        const arte = app.querySelector("[data-arte-demo]");
        if (arte) window.RcarArte.montar(arte, dadosArte(veiculoAberto));
      } else app.innerHTML = telaVeiculos(parametros);
    } else app.innerHTML = telaInicio();
    painel.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === secao) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function ir(hash, avisoNovo = "") {
    aviso = avisoNovo;
    if (location.hash === hash) desenhar();
    else location.hash = hash;
    scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- ações

  app.addEventListener("change", (e) => {
    const id = e.target.dataset.situacao;
    if (!id) return;
    const v = veiculo(Number(id));
    mudarSituacao(v, e.target.value);
    if (!salvar()) return desenhar();
    if (v.situacao === "vendido" && v.preco_venda == null) {
      // Como no painel real: leva ao bloco da venda para registrar valor, custo e origem.
      ir(`#/veiculos/${v.id}`, `${D.titulo(v)}: vendido. Informe o valor da venda, o custo e de onde veio o comprador.`);
      requestAnimationFrame(() => document.getElementById("venda")?.scrollIntoView());
      return;
    }
    aviso = `${D.titulo(v)}: ${D.SITUACOES[v.situacao].toLowerCase()}.`;
    desenhar();
  });

  app.addEventListener("submit", async (e) => {
    const form = e.target;
    e.preventDefault();

    if (form.matches("[data-busca]")) {
      const atual = rota().parametros;
      const novos = new URLSearchParams();
      if (atual.get("situacao")) novos.set("situacao", atual.get("situacao"));
      if (form.elements.q.value.trim()) novos.set("q", form.elements.q.value.trim());
      location.hash = `#/veiculos${novos.toString() ? `?${novos}` : ""}`;
      return;
    }

    if (form.matches("[data-veiculo]")) {
      const novo = form.dataset.veiculo === "novo";
      const v = novo
        ? { id: Math.max(0, ...dados.veiculos.map((x) => x.id)) + 1, situacao: "disponivel", vendido_em: null, criado_em: agora(), fotos: [] }
        : veiculo(Number(form.dataset.veiculo));
      const copia = { ...v };
      const precoAntes = v.preco;
      let automatico;
      try {
        automatico = aplicarFormulario(v, form, !novo);
      } catch (erro) {
        Object.assign(v, copia);
        const rascunho = Object.fromEntries(new FormData(form));
        rascunho.ativo = form.elements.ativo.checked;
        rascunho.destaque = form.elements.destaque.checked;
        app.innerHTML = telaFormulario(novo ? null : v, erro.message, rascunho);
        scrollTo(0, 0);
        return;
      }
      if (novo) dados.veiculos.push(v);
      if (!salvar()) return;
      if (novo) {
        ir(`#/veiculos/${v.id}`, "Veículo cadastrado. Agora envie as fotos.");
        requestAnimationFrame(() => document.getElementById("fotos")?.scrollIntoView());
      } else if (automatico) {
        ir(`#/veiculos/${v.id}`, `Preço baixou: o site mostra “De ${D.reais(precoAntes)} por ${D.reais(v.preco)}”. Para não mostrar, apague o campo “De”.`);
      } else ir(`#/veiculos/${v.id}`, "Dados do veículo salvos.");
      return;
    }

    if (form.matches("[data-fichas]")) {
      for (const linha of form.querySelectorAll("[data-ficha]")) {
        const v = veiculo(Number(linha.dataset.ficha));
        const campo = (nome) => linha.querySelector(`[name="${nome}"]`).value.trim();
        try {
          Object.assign(v, {
            versao: campo("versao").slice(0, 80),
            km: lerInteiro(campo("km")),
            cambio: LISTAS.cambios.includes(campo("cambio")) ? campo("cambio") : "",
            combustivel: LISTAS.combustiveis.includes(campo("combustivel")) ? campo("combustivel") : "",
            cor: campo("cor").slice(0, 30),
            preco_compra: lerCentavos(campo("preco_compra")),
          });
        } catch (erro) {
          aviso = `${D.titulo(v)}: ${erro.message}.`;
          return desenhar();
        }
      }
      if (salvar()) aviso = "Fichas atualizadas.";
      desenhar();
      return;
    }

    if (form.matches("[data-fotos]") && veiculoAberto) {
      const v = veiculoAberto;
      const arquivos = [...form.elements.fotos.files].slice(0, 20);
      const erros = [];
      let enviadas = 0;
      for (const arquivo of arquivos) {
        try {
          v.fotos.push(await reduzirFoto(arquivo));
          enviadas++;
        } catch (erro) {
          erros.push(erro.message);
        }
      }
      if (!salvar()) v.fotos.splice(v.fotos.length - enviadas, enviadas);
      else aviso = erros.length ? erros.join("; ") : `${enviadas} foto(s) enviada(s).`;
      desenhar();
      document.getElementById("fotos")?.scrollIntoView();
    }
  });

  app.addEventListener("click", (e) => {
    const v = veiculoAberto;
    if (!v) return;
    const botao = e.target.closest("button");
    if (!botao) return;
    if (botao.dataset.capa) {
      const [foto] = v.fotos.splice(Number(botao.dataset.capa), 1);
      v.fotos.unshift(foto);
    } else if (botao.dataset.apagarFoto) {
      if (!confirm("Apagar esta foto?")) return;
      v.fotos.splice(Number(botao.dataset.apagarFoto), 1);
    } else if (botao.hasAttribute("data-apagar-veiculo")) {
      if (!confirm(`Apagar “${D.titulo(v)}” com todas as fotos? Para tirar do site sem perder o cadastro, marque como vendido.`)) return;
      dados.veiculos = dados.veiculos.filter((x) => x !== v);
      salvar();
      ir("#/veiculos", `“${D.titulo(v)}” apagado.`);
      return;
    } else return;
    salvar();
    desenhar();
    document.getElementById("fotos")?.scrollIntoView();
  });

  painel.querySelector("[data-restaurar]").addEventListener("click", async () => {
    if (!confirm("Voltar ao estoque publicado? As alterações feitas nesta demonstração serão perdidas.")) return;
    await carregar(true);
    ir("#/", "Estoque restaurado para o que está publicado no site.");
  });

  painel.querySelector("[data-sair]").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(ENTROU);
    } catch {
      /* nada guardado */
    }
    telaLogin.hidden = false;
    painel.hidden = true;
  });

  telaLogin.querySelector("[data-entrar]").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      sessionStorage.setItem(ENTROU, "1");
    } catch {
      /* sem sessionStorage: entra só até recarregar a página */
      telaLogin.hidden = true;
      painel.hidden = false;
      desenhar();
      return;
    }
    mostrar();
  });

  window.addEventListener("hashchange", desenhar);

  function mostrar() {
    let entrou = false;
    try {
      entrou = sessionStorage.getItem(ENTROU) === "1";
    } catch {
      /* sem sessionStorage: pede o login de novo */
    }
    telaLogin.hidden = entrou;
    painel.hidden = !entrou;
    if (entrou) desenhar();
  }

  carregar().then(mostrar, () => {
    document.body.innerHTML = '<p class="aviso erro" style="margin:20px">Não foi possível carregar o estoque da demonstração.</p>';
  });
})();
