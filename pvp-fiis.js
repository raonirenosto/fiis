const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const { exec } = require("child_process")
const path = require("path")
const { analisarFiis } = require("./modulo_meses_rendimentos")

// ===============================
// 📥 LER FIIs
// ===============================

function lerFiis() {

    if (!fs.existsSync("lista_fiis.txt")) {
        console.log("⚠️ Arquivo lista_fiis.txt não encontrado")
        return []
    }

    return fs.readFileSync("lista_fiis.txt", "utf-8")
        .split(/[\r\n\s,]+/)
        .map(l => l.trim().toUpperCase())
        .filter(l => l)
}

// ===============================
// 📥 LER PROPORÇÕES
// ===============================

function lerProporcoes() {

    const mapa = {}

    if (!fs.existsSync("lista_proporcao.txt")) {
        return mapa
    }

    const linhas = fs.readFileSync("lista_proporcao.txt", "utf-8")
        .split(/\r?\n/)
        .map(l => l.trim().toUpperCase())
        .filter(l => l)

    let tickerAtual = null

    linhas.forEach(linha => {

        if (/^[A-Z]{4}\d{2}$/.test(linha)) {

            tickerAtual = linha
        }
        else if (linha.includes("%") && tickerAtual) {

            mapa[tickerAtual] = linha
            tickerAtual = null
        }
    })

    return mapa
}

// ===============================
// 📥 LER EXCLUÍDOS
// ===============================

function lerExcluidos() {

    if (!fs.existsSync("lista_excluidos.txt")) {
        return new Set()
    }

    return new Set(
        fs.readFileSync("lista_excluidos.txt", "utf-8")
            .split(/\r?\n/)
            .map(l => l.trim().toUpperCase())
            .filter(l => l)
    )
}

// ===============================
// 🌐 PROCESSAR FII
// ===============================

async function processarFii(ticker) {

    const url = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`

    try {

        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        })

        const $ = cheerio.load(response.data)

        let pvp = null
        let dy = null
        let precoAtual = null
        let ultimoProvento = null

        $("div").each((i, el) => {

            const title = $(el).find(".title").text().trim()

            if (title.includes("P/VP")) {
                pvp = $(el).find("strong.value").text().trim()
            }

            if ($(el).attr("title") === "Dividend Yield com base nos últimos 12 meses") {
                dy = $(el).parent().find("strong.value").text().trim()
            }

            if (title.includes("Valor atual")) {
                precoAtual = $(el).find("strong.value").text().trim()
            }
        })

        $("tr").each((i, el) => {

            const primeira = $(el).find("td").first().text().trim()

            if (primeira === "Rendimento" && !ultimoProvento) {
                ultimoProvento = $(el).find("td").last().text().trim()
            }
        })

        return {
            ticker,
            precoAtual,
            pvpTexto: pvp,
            pvpNumero: parseFloat(pvp?.replace(",", ".")),
            dy,
            ultimoProvento
        }

    } catch (e) {

        console.log("Erro:", ticker)

        return null
    }
}

// ===============================
// 🧾 GERAR HTML
// ===============================

function gerarHtml(resultados, proporcoes, excluidos, comMeses) {

    let linhas = ""

    const limite = 100 / resultados.length

    const candidatosTop = resultados.filter(r => {

        const prop = proporcoes[r.ticker]?.replace("%", "").replace(",", ".")
        const num = parseFloat(prop)

        return !num || num < limite
    })

    const top2 = [...candidatosTop]
        .filter(r => {

            const preco = parseFloat(
                r.precoAtual
                    .replace("R$", "")
                    .replace(/\./g, "")
                    .replace(",", ".")
            )

            const provento = parseFloat(
                r.ultimoProvento
                    .replace(/\./g, "")
                    .replace(",", ".")
            )

            const dyMensal = (provento / preco) * 100
            const dyAnual = dyMensal * 12

            return r.pvpNumero <= 1 && dyAnual >= 8
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(r => r.ticker)

    resultados.forEach(r => {

        const preco = parseFloat(
            r.precoAtual
                .replace("R$", "")
                .replace(/\./g, "")
                .replace(",", ".")
        )

        const provento = parseFloat(
            r.ultimoProvento
                .replace(/\./g, "")
                .replace(",", ".")
        )

        const dyMensal = (provento / preco) * 100
        const dyAnual = dyMensal * 12

        const rendimento5000 = (dyMensal / 100) * 5000
        const rendimento10000 = (dyMensal / 100) * 10000

        const proporcaoStr = proporcoes[r.ticker.toUpperCase()] || "-"

        let classe = ""

        const ehVermelho = r.pvpNumero > 1
        const ehAmarelo = dyAnual < 8

        if (excluidos.has(r.ticker.toUpperCase())) {
            classe = "excluido"
        }
        else if (top2.includes(r.ticker)) {
            classe = "top"
        }
        else if (ehVermelho && ehAmarelo) {
            classe = "roxo"
        }
        else if (ehVermelho) {
            classe = "caro"
        }
        else if (ehAmarelo) {
            classe = "baixoDy"
        }

        linhas += `
<tr class="${classe}">
<td>${r.ticker}</td>
<td>${r.precoAtual}</td>
<td>${r.pvpTexto}</td>
<td>${r.dy}</td>
<td>${r.ultimoProvento}</td>
<td>${dyMensal.toFixed(2)}%</td>
<td>${dyAnual.toFixed(2)}%</td>
<td>${r.score.toFixed(3)}</td>
${comMeses ? `<td>${r.mesesRendimento ?? "-"}</td>` : ""}
<td>${proporcaoStr}</td>
<td>R$ ${rendimento5000.toFixed(2)}</td>
<td>R$ ${rendimento10000.toFixed(2)}</td>
</tr>
`
    })

    const html = `
<html>

<head>

<meta charset="UTF-8">

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>

<style>

body{
    font-family:Arial;
    background:#f4f8ff;
    padding:40px;
}

.topo{
    width:1300px;
    margin:auto auto 25px auto;
    position:relative;
}

h1{
    text-align:center;
    margin:0;
    font-size:36px;
}

.btn-pdf{
    position:absolute;
    right:0;
    top:50%;
    transform:translateY(-50%);

    width:42px;
    height:42px;

    border:none;
    border-radius:10px;

    background:#e53935;
    color:white;

    cursor:pointer;

    font-size:20px;

    display:flex;
    align-items:center;
    justify-content:center;
}

.btn-pdf:hover{
    opacity:0.9;
}

table{
    border-collapse:collapse;
    width:1300px;
    margin:auto;
}

th{
    background:#4a90e2;
    color:white;
    padding:12px;
    cursor:pointer;
}

td{
    padding:10px;
    text-align:center;
}

.seta{
    margin-left:5px;
    font-size:12px;
}

tr:nth-child(even){
    background:#e6f0ff;
}

tr:nth-child(odd){
    background:#ffffff;
}

.top{
    background:#00e676 !important;
    font-weight:bold;
}

.caro{
    background:#ffd6d6 !important;
}

.baixoDy{
    background:#fff3b0 !important;
}

.roxo{
    background:#d6b3ff !important;
    font-weight:bold;
}

.excluido{
    text-decoration:line-through;
    color:#888;
    background:#f0f0f0 !important;
}

.legenda{
    width:1300px;
    margin:30px auto 0 auto;
    background:white;
    padding:20px;
    border-radius:10px;
    box-shadow:0 2px 8px rgba(0,0,0,0.1);
}

.item-legenda{
    display:flex;
    align-items:center;
    margin:10px 0;
}

.cor{
    width:25px;
    height:25px;
    margin-right:12px;
    border:1px solid #999;
}

.verde{
    background:#00e676;
}

.amarelo{
    background:#fff3b0;
}

.vermelho{
    background:#ffd6d6;
}

.roxo-cor{
    background:#d6b3ff;
}

.toggle-cores{
    position:absolute;
    right:60px;
    top:50%;
    transform:translateY(-50%);
    font-size:14px;
    cursor:pointer;
    user-select:none;
}

.sem-cor{
    background:none !important;
    text-decoration:none !important;
    color:inherit !important;
    font-weight:normal !important;
}

.sem-cor:nth-child(even){
    background:#e6f0ff !important;
}

.sem-cor:nth-child(odd){
    background:#ffffff !important;
}

.data-geracao{
    width:1300px;
    margin:15px auto 0 auto;
    text-align:right;
    color:#666;
    font-size:14px;
}

</style>

</head>

<body>

<div class="topo">

    <h1>Scanner de FIIs</h1>

    <button class="btn-pdf" onclick="exportarPDF()" title="Exportar PDF">
        📄
    </button>

    <label class="toggle-cores">
        <input type="checkbox" id="checkCores" checked onchange="toggleCores()">
        Cores por categoria
    </label>

</div>

<table id="tabelaFiis">

<thead>

<tr>
<th onclick="ordenarTabela(0)">Ticker <span class="seta">↕</span></th>
<th onclick="ordenarTabela(1)">Preço <span class="seta">↕</span></th>
<th onclick="ordenarTabela(2)">P/VP <span class="seta">↕</span></th>
<th onclick="ordenarTabela(3)">DY 12m <span class="seta">↕</span></th>
<th onclick="ordenarTabela(4)">Último Provento <span class="seta">↕</span></th>
<th onclick="ordenarTabela(5)">DY Mensal <span class="seta">↕</span></th>
<th onclick="ordenarTabela(6)">DY Anual <span class="seta">↕</span></th>
<th onclick="ordenarTabela(7)">Score <span class="seta">↕</span></th>
${comMeses ? `<th onclick="ordenarTabela(8)">Meses Rend. <span class="seta">↕</span></th>` : ""}
<th onclick="ordenarTabela(${comMeses ? 9 : 8})">% Carteira <span class="seta">↕</span></th>
<th onclick="ordenarTabela(${comMeses ? 10 : 9})">R$ 5.000 <span class="seta">↕</span></th>
<th onclick="ordenarTabela(${comMeses ? 11 : 10})">R$ 10.000 <span class="seta">↕</span></th>
</tr>

</thead>

<tbody>

${linhas}

</tbody>

</table>

<div class="legenda">

<h3>Legenda das cores</h3>

<div class="item-legenda">
    <span class="cor verde"></span>
    Verde = FIIs com os melhores scores, dentro do ideal da carteira (${limite.toFixed(2)}%)
</div>

<div class="item-legenda">
    <span class="cor amarelo"></span>
    Amarelo = DY anual abaixo de 8%
</div>

<div class="item-legenda">
    <span class="cor vermelho"></span>
    Vermelho = P/VP acima de 1
</div>

<div class="item-legenda">
    <span class="cor roxo-cor"></span>
    Roxo = DY abaixo de 8% e P/VP acima de 1
</div>

</div>

<div class="data-geracao">
    Gerado em:
    <span id="dataGeracao"></span>
</div>

<script>

function atualizarDataGeracao(){

    const agora = new Date()

    const data = agora.toLocaleDateString("pt-BR")
    const hora = agora.toLocaleTimeString("pt-BR")

    document.getElementById("dataGeracao").innerText =
        data + " às " + hora
}

function exportarPDF(){

    const botao = document.querySelector(".btn-pdf")
    const toggle = document.querySelector(".toggle-cores")
    const legenda = document.querySelector(".legenda")
    const coresAtivas = document.getElementById("checkCores").checked

    botao.style.display = "none"
    toggle.style.display = "none"

    if(!coresAtivas){
        legenda.style.display = "none"
    }

    const elemento = document.body

    const opt = {
        margin:0.5,
        filename:"scanner-fiis.pdf",

        image:{
            type:"jpeg",
            quality:1
        },

        html2canvas:{
            scale:2
        },

        jsPDF:{
            unit:"in",
            format:"a3",
            orientation:"landscape"
        }
    }

    html2pdf()
        .set(opt)
        .from(elemento)
        .save()
        .then(() => {

            botao.style.display = "flex"
            toggle.style.display = "block"

            if(!coresAtivas){
                legenda.style.display = "none"
            }
        })
}

let ordemAsc = true
let colunaAtual = -1

function limparValor(valor){

    valor = valor.replace("R$","").replace("%","").trim()

    if(valor.includes(",")){
        valor = valor.replace(/\\\\./g,"").replace(",",".")
    }

    return valor
}

function ordenarTabela(coluna){

    const tabela = document.getElementById("tabelaFiis")

    const tbody = tabela.tBodies[0]

    const linhas = Array.from(tbody.rows)

    const headers = tabela.querySelectorAll("th")

    headers.forEach(th=>{
        th.querySelector(".seta").innerText = "↕"
    })

    if(coluna === colunaAtual){
        ordemAsc = !ordemAsc
    }
    else{
        ordemAsc = true
        colunaAtual = coluna
    }

    linhas.sort((a,b)=>{

        let valA = limparValor(a.cells[coluna].innerText)
        let valB = limparValor(b.cells[coluna].innerText)

        const numA = parseFloat(valA)
        const numB = parseFloat(valB)

        if(!isNaN(numA) && !isNaN(numB)){
            return ordemAsc ? numA - numB : numB - numA
        }

        return ordemAsc
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA)
    })

    const seta = headers[coluna].querySelector(".seta")

    seta.innerText = ordemAsc ? "↑" : "↓"

    linhas.forEach(linha => tbody.appendChild(linha))
}

function toggleCores(){

    const ativo = document.getElementById("checkCores").checked
    const linhas = document.querySelectorAll("#tabelaFiis tbody tr")
    const legenda = document.querySelector(".legenda")

    linhas.forEach(tr => {
        if(ativo){
            tr.classList.remove("sem-cor")
        } else {
            tr.classList.add("sem-cor")
        }
    })

    legenda.style.display = ativo ? "block" : "none"
}

atualizarDataGeracao()

</script>

</body>

</html>
`

    const agora = new Date()
    const dia = String(agora.getDate()).padStart(2, "0")
    const mes = String(agora.getMonth() + 1).padStart(2, "0")
    const ano = agora.getFullYear()
    const hora = String(agora.getHours()).padStart(2, "0")
    const minuto = String(agora.getMinutes()).padStart(2, "0")
    const timestamp = `${dia}-${mes}-${ano}-${hora}h${minuto}`

    const pasta = "relatorios"

    if (!fs.existsSync(pasta)) {
        fs.mkdirSync(pasta)
    }

    const nomeArquivo = comMeses
        ? `relatorio-com-meses-de-rendimento-${timestamp}.html`
        : `relatorio-basico-${timestamp}.html`

    const caminhoArquivo = path.join(pasta, nomeArquivo)

    fs.writeFileSync(caminhoArquivo, html)

    const caminho = path.resolve(caminhoArquivo)

    const comando =
        process.platform === "win32"
            ? `start "" "${caminho}"`
            : process.platform === "darwin"
                ? `open "${caminho}"`
                : `xdg-open "${caminho}"`

    exec(comando)
}

// ===============================
// 🚀 MAIN
// ===============================

async function main() {

    const args = process.argv.slice(2)
    const semMeses = args.includes("--sem-meses")
    const semCache = args.includes("--sem-cache")

    const fiis = lerFiis()

    console.log(`📊 ${fiis.length} FIIs carregados`)

    const proporcoes = lerProporcoes()
    const excluidos = lerExcluidos()

    const resultados = []

    for (const fii of fiis) {

        const d = await processarFii(fii)

        if (d) {
            resultados.push(d)
        }
    }

    resultados.forEach(r => {

        const dy = parseFloat(
            r.dy?.replace("%", "").replace(",", ".")
        )

        let score =
            (dy / 100) * 0.7 +
            (1 / r.pvpNumero) * 0.3

        if (excluidos.has(r.ticker.toUpperCase())) {
            score = 0
        }

        r.score = score
    })

    resultados.sort((a, b) => b.score - a.score)

    if (!semMeses) {

        console.log("📈 Analisando meses de rendimento...")

        const mesesResultados = await analisarFiis(fiis, { semCache })

        const mapaMeses = {}

        mesesResultados.forEach(m => {
            if (!m.erro) {
                mapaMeses[m.ticker.toUpperCase()] = m.meses
            }
        })

        resultados.forEach(r => {
            r.mesesRendimento = mapaMeses[r.ticker.toUpperCase()] ?? null
        })
    }

    gerarHtml(resultados, proporcoes, excluidos, !semMeses)
}

main()