# R-CAR Veículos

Site da R-CAR Veículos (Jaru-RO), com showroom, estoque de carros, entregas e contato pelo WhatsApp. Tem também um painel para manter o estoque.

## O que tem

**Site (público)**
- Início: o mesmo visual do site original, com a seção "No salão agora" mostrando até 6 carros do estoque.
- Estoque (`/estoque`): todos os carros disponíveis e reservados, com busca e filtro por marca, câmbio e ordem (preço, ano, km). O filtro roda no navegador, então funciona igual na cópia do GitHub Pages.
- Página do veículo: galeria de fotos, preço (ou "Consulte o preço"), ficha (ano, km, câmbio, combustível, cor), opcionais, descrição e botão "Tenho interesse", que abre o WhatsApp com a mensagem pronta.
- Com o estoque vazio, o site mostra o botão para pedir a lista pelo WhatsApp, como era antes.

**Painel (`/admin`)**
- Início: quantos carros estão disponíveis, reservados e vendidos no mês, além de aviso de carro no site sem foto.
- Veículos: cadastrar, editar, filtrar por situação, buscar e apagar. A situação (disponível, reservado, vendido) muda direto na lista.
  - Reservado continua no site com selo dourado.
  - Vendido sai do site e conta no mês.
- Fotos: enviar várias de uma vez (redimensionadas automaticamente), escolher a capa e apagar.
- Destaque: o carro aparece primeiro, com selo vermelho. "Mostrar no site" desmarcado esconde o carro sem apagar.
- Vendas: dashboard com faturamento, ticket médio, tempo médio até vender, média por mês e valor do estoque; gráficos por mês (carros ou faturamento), por marca e por faixa de preço; últimas vendas. Filtra por período e marca. Usa os carros marcados como vendidos (data e preço do cadastro); os cálculos ficam em `static/js/vendas.js`, o mesmo arquivo da demonstração.
- Fotos ilustrativas: uma foto tem `credito` e `fonte` quando é de outro carro do mesmo modelo (por exemplo, do Wikimedia Commons). O site mostra o selo "Foto ilustrativa" no card e o crédito do autor e da licença na página do carro.
- Arte para Instagram: na tela do carro, gera a imagem de Story (9:16) ou Feed (4:5) com foto, preço e WhatsApp, desenhada no navegador (`static/js/arte.js`).
- Placa para o vidro (`/admin/veiculos/<id>/placa`): folha A4 para imprimir e colar no carro do salão, com preço (De/Por na oferta), ficha, até 8 opcionais e um QR code que abre a página do carro no site. O QR é gerado no navegador (`static/js/placa.js`, biblioteca qrcode-generator do cdnjs) e aponta para `URL_PUBLICA`, então configure essa variável antes de imprimir.
- Loja: WhatsApp que recebe os interessados, Instagram, endereço, cidade e horário.
- Minha senha: trocar a senha do painel.

Segurança: senha com scrypt, sessão em cookie assinado, proteção CSRF nos formulários do painel e limite de tentativas de login.

## Rodar no computador

```bash
uv sync
```

```bash
uv run uvicorn app.main:app --reload --port 8050
```

Abra http://localhost:8050. Na primeira execução o banco é criado em `dados/` e o acesso ao painel é salvo em `dados/acesso-painel.txt`. Troque a senha em `/admin/conta`.

Testes:

```bash
uv run pytest
```

## Publicar

No Render, use o `render.yaml` deste repositório: **New → Blueprint**, escolha o repositório e preencha `ADMIN_EMAIL`, `ADMIN_SENHA` e `URL_PUBLICA`. Ele está no **plano gratuito, só para teste**: sem disco, o banco e as fotos se apagam a cada deploy ou reinício, e o serviço dorme sem visitas. Para usar de verdade, troque para o plano Starter com disco (instruções no próprio `render.yaml`).

Em outro serviço que rode Python (Railway, Fly.io, uma VPS), configure as variáveis de ambiente:

| Variável | Para quê |
| --- | --- |
| `SECRET_KEY` | Chave das sessões. Use um valor longo e aleatório. |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | Acesso inicial do painel (só na primeira execução). |
| `LOJA_DADOS` | Pasta do banco e das fotos. Precisa ser um **disco persistente**. |
| `COOKIE_SEGURO=1` | Liga o cookie só em HTTPS (use em produção). |
| `URL_PUBLICA` | Endereço do site, para as prévias de link no WhatsApp (ex.: `https://rcarveiculos.com.br`). |

Comando de início: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

Faça backup da pasta `dados/` (banco `loja.db` e `uploads/`).

## Cópia no GitHub Pages

O GitHub Pages só serve arquivos estáticos, então ele recebe uma **cópia do site**: início, estoque e páginas dos veículos, sem o painel de verdade. Os carros e preços são os do momento em que a cópia foi gerada.

A cópia leva um **painel de demonstração** em `/admin/` (por exemplo https://victorlucassantos.github.io/rcar-veiculos/admin/), para mostrar a manutenção a clientes:
- Entra com qualquer senha e tem as mesmas telas do painel real: início, lista com situação, cadastro, edição, fotos e apagar.
- Tudo fica guardado só no navegador de quem está testando. Enquanto a demonstração está ativa, o site aberto nesse navegador mostra o estoque alterado, com uma faixa "Demonstração · abrir o painel".
- "Restaurar estoque" volta ao que está publicado. Publicar uma cópia nova também recomeça a demonstração.
- O dashboard de Vendas da demonstração traz 12 meses de **vendas fictícias**, com aviso na tela, geradas por `vendas_de_exemplo()` em `app/rotas_loja.py` (sempre as mesmas). O painel real nunca usa esses dados.
- Arquivos: `static/js/demo.js` (dados e cartões), `static/js/demo-admin.js` (telas), `app/templates/demo/` e as rotas `/demo/*` em `app/rotas_loja.py`, que só respondem ao exportador.

Para atualizar depois de mudar o estoque no painel, gere a cópia a partir do site no Render (ou do local) e publique:

```bash
uv run python scripts/exportar_pages.py --origem https://rcar-veiculos.onrender.com --publicar
```

Sem `--publicar`, só gera a pasta `site/` para conferir. O envio vai para o branch `gh-pages`. Em **Settings → Pages**, escolha **Deploy from a branch → `gh-pages` / root**. O endereço fica https://vampira-lady-gacha.github.io/rcar-veiculos/.

Para publicar em outro repositório, como o fork https://github.com/VictorLucasSantos/rcar-veiculos, informe o endereço público e o repositório:

```bash
uv run python scripts/exportar_pages.py --url-publica https://victorlucassantos.github.io/rcar-veiculos --remoto https://github.com/VictorLucasSantos/rcar-veiculos.git --publicar
```

## Estrutura

| Arquivo | Faz |
| --- | --- |
| `app/models.py` | Tabelas: veículo, foto, configuração, usuário |
| `app/servicos.py` | Formatação de preço e km, situação do veículo, mensagem do WhatsApp, fotos, senhas |
| `app/rotas_loja.py` | Páginas públicas: início, estoque, veículo, sitemap |
| `app/rotas_admin.py` | Painel |
| `app/seed.py` | Cria o banco e o usuário do painel |
| `scripts/exportar_pages.py` | Gera e publica a cópia estática do GitHub Pages |
| `app/templates/` | Páginas (Jinja2) |
| `static/` | CSS, JavaScript, logo e fotos da loja |
