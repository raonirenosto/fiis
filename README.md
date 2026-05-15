# Scanner de FIIs

Ferramenta de análise de Fundos Imobiliários que faz scraping no [Status Invest](https://statusinvest.com.br) e gera um relatório HTML interativo com dados de P/VP, Dividend Yield, score e proporção de carteira.

## Requisitos

- Node.js 18+

## Instalação

```bash
npm install
```

## Uso

### Relatório completo (padrão)

```bash
node pvp-fiis.js
```

Gera o relatório com preço, P/VP, DY, score, proporção da carteira e meses de rendimento.

### Relatório básico (rápido)

```bash
node pvp-fiis.js --sem-meses
```

Gera o relatório sem a coluna "Meses Rend." — útil quando quer apenas os dados básicos rapidamente.

### Cache de meses de rendimento

Na primeira execução, utiliza a API do Status Invest e Puppeteer para coletar o histórico completo. Os dados são salvos em cache (`cache_meses.csv`) e nas execuções seguintes apenas os meses novos são verificados via API — sem necessidade de recarregar todo o histórico.

**Primeira execução:** mais lenta (Puppeteer para FIIs sem quebra recente).
**Execuções seguintes:** instantânea (cache + verificação incremental via API).

## Arquivos de configuração

### lista_fiis.txt

Lista dos tickers a serem analisados, um por linha:

```
FATN11
PMLL11
TRXF11
HGLG11
```

### lista_proporcao.txt

Proporção atual de cada FII na carteira. Formato: ticker, valor investido, percentual (3 linhas por FII):

```
FATN11
R$ 56.185,95
10.53%
PMLL11
R$ 54.188,16
10.15%
```

### lista_excluidos.txt

FIIs que devem ser marcados como excluídos no relatório (riscados, score zerado):

```
PVBI11
TGAR11
```

## Saída

Os relatórios são gerados na pasta `relatorios/` com timestamp no nome e abertos automaticamente no navegador:

- `relatorios/relatorio-basico-18-07-2025-14h30.html`
- `relatorios/relatorio-com-meses-de-rendimento-18-07-2025-14h30.html`

### Funcionalidades do relatório

- Tabela ordenável por qualquer coluna (clique no cabeçalho)
- Exportação para PDF (botão no canto superior direito)
- Cores indicativas:
  - 🟢 **Verde** — Melhores scores, dentro do limite ideal da carteira
  - 🟡 **Amarelo** — DY anual abaixo de 8%
  - 🔴 **Vermelho** — P/VP acima de 1
  - 🟣 **Roxo** — DY abaixo de 8% e P/VP acima de 1
  - ⚪ **Riscado** — FII na lista de excluídos

### Colunas

| Coluna | Descrição |
|--------|-----------|
| Ticker | Código do FII |
| Preço | Cotação atual |
| P/VP | Preço sobre Valor Patrimonial |
| DY 12m | Dividend Yield dos últimos 12 meses |
| Último Provento | Valor do último rendimento pago |
| DY Mensal | Yield mensal calculado (provento/preço) |
| DY Anual | DY Mensal × 12 |
| Score | Ranking: (DY/100)×0.7 + (1/PVP)×0.3 |
| Meses Rend. | Meses consecutivos sem queda no rendimento (apenas com `--meses`) |
| % Carteira | Proporção atual na carteira |
| R$ 5.000 | Rendimento mensal estimado para R$ 5.000 investidos |
| R$ 10.000 | Rendimento mensal estimado para R$ 10.000 investidos |
