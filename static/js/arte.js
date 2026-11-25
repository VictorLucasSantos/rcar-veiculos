/* Arte para Instagram: desenha no navegador (canvas) a imagem de um carro em Story (1080×1920) ou
   Feed (1080×1350), com foto, nome, ficha, preço (De/Por na oferta) e chamada para o WhatsApp.
   Usado pelo painel real (dados embutidos na página) e pela demonstração (demo-admin.js chama
   RcarArte.montar). Nada sai do navegador: a imagem é baixada direto. */
(() => {
  "use strict";

  const FORMATOS = {
    story: { largura: 1080, altura: 1920, rotulo: "Story (9:16)" },
    feed: { largura: 1080, altura: 1350, rotulo: "Feed (4:5)" },
  };
  const COR = { noite: "#0d0e11", grafite: "#16181d", texto: "#eceef2", apagado: "#9ea3ae", vermelho: "#e3262c", lustre: "#d9b56a" };
  const DISPLAY = '"Saira", "Arial Narrow", Impact, sans-serif';
  const CORPO = '"Albert Sans", system-ui, sans-serif';

  const milhar = (n) => Math.round(n).toLocaleString("pt-BR");
  function reais(centavos) {
    const inteiro = Math.floor(centavos / 100);
    const resto = centavos % 100;
    return `R$ ${milhar(inteiro)}` + (resto ? `,${String(resto).padStart(2, "0")}` : "");
  }

  function carregarImagem(url) {
    return new Promise((ok) => {
      if (!url) return ok(null);
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = url;
    });
  }

  // Encolhe a fonte até o texto caber na largura.
  function ajustar(ctx, texto, fonte, tamanho, largura) {
    let t = tamanho;
    do {
      ctx.font = fonte.replace("{t}", t);
      if (ctx.measureText(texto).width <= largura) break;
      t -= 4;
    } while (t > 24);
    return t;
  }

  function retanguloArredondado(ctx, x, y, l, a, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + l, y, x + l, y + a, r);
    ctx.arcTo(x + l, y + a, x, y + a, r);
    ctx.arcTo(x, y + a, x, y, r);
    ctx.arcTo(x, y, x + l, y, r);
    ctx.closePath();
  }

  // Foto cobrindo a área (corta o excesso, como object-fit: cover).
  function cobrir(ctx, img, x, y, l, a) {
    const escala = Math.max(l / img.width, a / img.height);
    const lf = img.width * escala;
    const af = img.height * escala;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, l, a);
    ctx.clip();
    ctx.drawImage(img, x + (l - lf) / 2, y + (a - af) / 2, lf, af);
    ctx.restore();
  }

  function pilula(ctx, texto, x, y, fonte, fundo, cor, alinhamento = "esquerda") {
    ctx.font = fonte;
    const largura = ctx.measureText(texto).width + 44;
    const altura = parseInt(fonte.match(/(\d+)px/)[1], 10) * 1.55;
    const inicio = alinhamento === "centro" ? x - largura / 2 : x;
    ctx.fillStyle = fundo;
    retanguloArredondado(ctx, inicio, y, largura, altura, 10);
    ctx.fill();
    ctx.fillStyle = cor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(texto, inicio + 22, y + altura / 2 + 2);
    ctx.textBaseline = "alphabetic";
    return altura;
  }

  async function desenhar(canvas, d, formato) {
    const f = FORMATOS[formato];
    canvas.width = f.largura;
    canvas.height = f.altura;
    const ctx = canvas.getContext("2d");
    const L = f.largura;
    const margem = 64;
    const story = formato === "story";

    await Promise.all([
      document.fonts?.load(`italic 800 96px ${DISPLAY}`),
      document.fonts?.load(`600 40px ${CORPO}`),
    ].filter(Boolean)).catch(() => {});
    const [foto, logo] = await Promise.all([carregarImagem(d.foto), carregarImagem(d.logo)]);

    // fundo com o brilho dourado do lustre no alto, como no site
    ctx.fillStyle = COR.noite;
    ctx.fillRect(0, 0, L, f.altura);
    const brilho = ctx.createRadialGradient(L * 0.7, 0, 0, L * 0.7, 0, L * 0.9);
    brilho.addColorStop(0, "rgba(217,181,106,0.22)");
    brilho.addColorStop(1, "rgba(217,181,106,0)");
    ctx.fillStyle = brilho;
    ctx.fillRect(0, 0, L, f.altura);

    // logo
    let y = story ? 90 : 50;
    const alturaLogo = story ? 150 : 90;
    if (logo) {
      const l = (logo.width / logo.height) * alturaLogo;
      ctx.drawImage(logo, (L - l) / 2, y, l, alturaLogo);
    }
    y += alturaLogo + (story ? 60 : 28);

    // foto
    const alturaFoto = story ? 720 : 500;
    if (foto) cobrir(ctx, foto, 0, y, L, alturaFoto);
    else {
      ctx.fillStyle = COR.grafite;
      ctx.fillRect(0, y, L, alturaFoto);
      ctx.fillStyle = COR.apagado;
      ctx.font = `600 40px ${CORPO}`;
      ctx.textAlign = "center";
      ctx.fillText("Foto em breve", L / 2, y + alturaFoto / 2);
    }
    const sombra = ctx.createLinearGradient(0, y + alturaFoto - 220, 0, y + alturaFoto);
    sombra.addColorStop(0, "rgba(13,14,17,0)");
    sombra.addColorStop(1, "rgba(13,14,17,1)");
    ctx.fillStyle = sombra;
    ctx.fillRect(0, y + alturaFoto - 220, L, 220);
    if (d.selo) pilula(ctx, d.selo.toUpperCase(), margem, y + 40, `italic 800 44px ${DISPLAY}`, d.oferta ? COR.vermelho : COR.lustre, d.oferta ? "#fff" : "#1a1405");
    if (foto && d.ilustrativa) {
      ctx.font = `600 26px ${CORPO}`;
      const texto = "Foto ilustrativa do modelo";
      const largura = ctx.measureText(texto).width + 28;
      ctx.fillStyle = "rgba(13,14,17,0.78)";
      retanguloArredondado(ctx, L - margem - largura, y + 40, largura, 44, 8);
      ctx.fill();
      ctx.fillStyle = COR.texto;
      ctx.textAlign = "left";
      ctx.fillText(texto, L - margem - largura + 14, y + 71);
    }
    y += alturaFoto + (story ? 30 : 10);

    // nome, versão e ficha
    ctx.textAlign = "left";
    const tNome = ajustar(ctx, d.nome, `italic 800 {t}px ${DISPLAY}`, story ? 110 : 92, L - 2 * margem);
    const cromo = ctx.createLinearGradient(0, y, 0, y + tNome);
    cromo.addColorStop(0, "#ffffff");
    cromo.addColorStop(0.45, "#d9dce2");
    cromo.addColorStop(0.6, "#9da2ab");
    cromo.addColorStop(1, "#e9ebef");
    ctx.fillStyle = cromo;
    ctx.font = `italic 800 ${tNome}px ${DISPLAY}`;
    y += tNome;
    ctx.fillText(d.nome, margem, y);
    ctx.fillStyle = COR.apagado;
    const ficha = [d.versao, ...d.ficha].filter(Boolean).join("  ·  ");
    if (ficha) {
      const tFicha = ajustar(ctx, ficha, `500 {t}px ${CORPO}`, story ? 40 : 34, L - 2 * margem);
      ctx.font = `500 ${tFicha}px ${CORPO}`;
      y += tFicha + 22;
      ctx.fillText(ficha, margem, y);
    }

    // preço: De riscado, Por grande e a economia
    y += story ? 70 : 60;
    if (d.preco && d.preco_anterior) {
      ctx.font = `500 ${story ? 46 : 40}px ${CORPO}`;
      ctx.fillStyle = COR.apagado;
      const de = `De ${reais(d.preco_anterior)} por`;
      ctx.fillText(de, margem, y);
      const inicioRisco = margem + ctx.measureText("De ").width;
      const fimRisco = margem + ctx.measureText(`De ${reais(d.preco_anterior)}`).width;
      ctx.fillRect(inicioRisco, y - (story ? 16 : 14), fimRisco - inicioRisco, 4);
      y += story ? 16 : 10;
    }
    const tPreco = story ? 150 : 110;
    ctx.font = `italic 800 ${tPreco}px ${DISPLAY}`;
    ctx.fillStyle = COR.texto;
    y += tPreco - 20;
    ctx.fillText(d.preco ? reais(d.preco) : "Consulte o preço", margem, y);
    if (d.preco && d.preco_anterior) {
      y += 30;
      y += pilula(ctx, `${reais(d.preco_anterior - d.preco)} a menos`, margem, y, `700 ${story ? 44 : 38}px ${CORPO}`, COR.vermelho, "#fff");
    }

    // chamada para o WhatsApp no rodapé
    const alturaBotao = story ? 128 : 108;
    const rodape = story ? 130 : 96;
    const yBotao = f.altura - rodape - alturaBotao;
    ctx.fillStyle = COR.vermelho;
    retanguloArredondado(ctx, margem, yBotao, L - 2 * margem, alturaBotao, 18);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    const chamada = `Chame no WhatsApp ${d.loja.telefone}`;
    const tChamada = ajustar(ctx, chamada, `italic 800 {t}px ${DISPLAY}`, story ? 56 : 48, L - 2 * margem - 60);
    ctx.font = `italic 800 ${tChamada}px ${DISPLAY}`;
    ctx.fillText(chamada, L / 2, yBotao + alturaBotao / 2 + tChamada * 0.36);
    ctx.fillStyle = COR.apagado;
    ctx.font = `500 ${story ? 36 : 32}px ${CORPO}`;
    const linha = [d.loja.instagram ? `@${d.loja.instagram}` : "", d.loja.endereco].filter(Boolean).join("  ·  ");
    ctx.fillText(linha, L / 2, f.altura - rodape / 2 + 10, L - 2 * margem);
    ctx.textAlign = "left";
  }

  function nomeArquivo(d, formato) {
    const base = `${d.nome} ${d.ano}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `rcar-${base}-${formato}.png`;
  }

  // Monta a seção: botões de formato, prévia e "Baixar imagem".
  function montar(alvo, dados) {
    let formato = "story";
    const canvas = document.createElement("canvas");
    canvas.className = "arte-previa";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Prévia da arte de ${dados.nome} ${dados.ano}`);
    const grupo = document.createElement("div");
    grupo.className = "alternar";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Formato da arte");
    const baixar = document.createElement("button");
    baixar.type = "button";
    baixar.className = "btn red sm";
    baixar.textContent = "Baixar imagem";

    const botoes = Object.entries(FORMATOS).map(([chave, f]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.rotulo;
      b.addEventListener("click", () => {
        formato = chave;
        atualizar();
      });
      grupo.append(b);
      return [chave, b];
    });

    async function atualizar() {
      botoes.forEach(([chave, b]) => b.setAttribute("aria-pressed", String(chave === formato)));
      alvo.classList.add("desenhando");
      await desenhar(canvas, dados, formato);
      alvo.classList.remove("desenhando");
    }

    baixar.addEventListener("click", () => {
      canvas.toBlob((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = nomeArquivo(dados, formato);
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, "image/png");
    });

    const controles = document.createElement("div");
    controles.className = "arte-controles";
    controles.append(grupo, baixar);
    alvo.replaceChildren(controles, canvas);
    return atualizar();
  }

  window.RcarArte = { montar, desenhar, FORMATOS };

  // Painel real: dados embutidos na página do veículo.
  const auto = document.querySelector("[data-arte]");
  const dadosAuto = document.querySelector("[data-arte-dados]");
  if (auto && dadosAuto) montar(auto, JSON.parse(dadosAuto.textContent));
})();
