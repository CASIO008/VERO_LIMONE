# DAVVERO LIMONE

Loja streetwear estática: vitrine, departamentos, página de produto, checkout
demonstrativo, conta com cartões em slots e atendimento. Sem framework, sem
dependências de build — HTML, CSS e JavaScript puros.

- **Link público (GitHub Pages):** https://casio008.github.io/VERO_LIMONE/
- **Repositório:** https://github.com/CASIO008/VERO_LIMONE

## Como o site é publicado (GitHub Actions)

O workflow [`\.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
roda a cada `push` na branch `main` (ou manualmente em **Actions → Run workflow**):

1. baixa o código;
2. roda `node tools/check-globals.js` (checagem de colisões de escopo);
3. monta a pasta `_site/` apenas com os arquivos do site (HTML, CSS, JS,
   `fonts/`, `images/`, `vendor/`) e cria o `.nojekyll`;
4. publica no GitHub Pages.

**Na primeira vez**, em **Settings → Pages** coloque o **Source** em
**GitHub Actions** — é obrigatório: o token padrão do Actions não consegue
criar o site, só publicar nele (se aparecer `Resource not accessible by
integration`, é esse passo que falta). O repositório também precisa ser
público (ou a conta ter GitHub Pro) para o Pages ficar disponível de graça.

Depois do primeiro deploy, o link é sempre:

```
https://casio008.github.io/VERO_LIMONE/
```

Pronto para mandar para qualquer pessoa — funciona no celular e no desktop.

> No Pages o site roda no **modo local**: conta, cartões, sacola e pedidos
> ficam no armazenamento do próprio navegador de quem visita. Nenhum dado
> sensível de cartão é guardado (só bandeira, banco, 4 últimos dígitos e
> validade). O servidor Node continua **opcional**, para rodar em casa.

## Rodar na sua máquina

- **Sem servidor:** dê um duplo clique em `ABRIR-LOJA.cmd` (abre o
  `index.html` no navegador padrão).
- **Com servidor + SQLite (opcional):** duplo clique em
  `ABRIR-SERVIDOR.cmd` e acesse `http://localhost:4173`.
  Requer Node.js 22+.

## Checagens

```bash
node tools/check-globals.js     # colisões de nomes no escopo global
node tools/browser-check.mjs    # roteiro completo no Chrome headless (conta + checkout)
```

## Estrutura

```
index.html        home (vitrine, departamentos, coleção, lookbook)
homem.html        departamento masculino      mulher.html  departamento feminino
produto.html      página do produto (galeria + info)
look.html         look completo               sobre.html   sobre a marca
conta.html        conta, cartões, endereços, pedidos
checkout.html     checkout em 5 etapas
contato.html      atendimento                404.html     página de erro
data.js           catálogo, marca, utilidades e carrinho
script.js         home          produto.js    PDP
pages.js          páginas internas (departamento, look, contato)
auth.js           conta local/servidor        wallet.js    carteira em slots
pay-core.js       bandeiras, bancos e cartão  checkout.js  checkout
styles.css        estilos      pages.css   pay.css
images/           fotos, logos de bancos (Tgentil/Bancos-em-SVG) e pagamentos
server/           servidor Node opcional (SQLite) — não vai para o Pages
tools/            checagens e utilitários de assets
```
