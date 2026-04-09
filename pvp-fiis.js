const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const { exec } = require("child_process")
const path = require("path")

// ===============================
// 📥 LER FIIs DO ARQUIVO
// ===============================

function lerFiis() {

    if (!fs.existsSync("lista_fiis.txt")) {
        console.log("⚠️ Arquivo lista_fiis.txt não encontrado")
        return []
    }

    return fs.readFileSync("lista_fiis.txt", "utf-8")
        .split(/[\r\n\s,]+/) // aceita quebra de linha, espaço ou vírgula
        .map(l => l.trim().toUpperCase())
        .filter(l => l)
}

// ===============================
// 📥 OUTRAS LEITURAS
// ===============================

function lerProporcoes(){
    const mapa = {}

    if(!fs.existsSync("lista_proporcao.txt")) return mapa

    const linhas = fs.readFileSync("lista_proporcao.txt","utf-8")
        .split(/\r?\n/)
        .map(l => l.trim().toUpperCase())
        .filter(l => l)

    let tickerAtual = null

    linhas.forEach(linha =>{
        if(/^[A-Z]{4}\d{2}$/.test(linha)){
            tickerAtual = linha
        }
        else if(linha.includes("%") && tickerAtual){
            mapa[tickerAtual] = linha
            tickerAtual = null
        }
    })

    return mapa
}

function lerExcluidos(){
    if(!fs.existsSync("lista_excluidos.txt")) return new Set()

    return new Set(
        fs.readFileSync("lista_excluidos.txt","utf-8")
        .split(/\r?\n/)
        .map(l => l.trim().toUpperCase())
        .filter(l => l)
    )
}

// ===============================
// 🌐 SCRAPING
// ===============================

async function processarFii(ticker){

    const url = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`

    try{
        const response = await axios.get(url,{ headers:{ "User-Agent":"Mozilla/5.0" } })
        const $ = cheerio.load(response.data)

        let pvp=null, dy=null, precoAtual=null, ultimoProvento=null

        $("div").each((i,el)=>{
            const title = $(el).find(".title").text().trim()

            if(title.includes("P/VP")) pvp = $(el).find("strong.value").text().trim()
            if($(el).attr("title")==="Dividend Yield com base nos últimos 12 meses")
                dy = $(el).parent().find("strong.value").text().trim()
            if(title.includes("Valor atual"))
                precoAtual = $(el).find("strong.value").text().trim()
        })

        $("tr").each((i,el)=>{
            const primeira = $(el).find("td").first().text().trim()
            if(primeira==="Rendimento" && !ultimoProvento)
                ultimoProvento = $(el).find("td").last().text().trim()
        })

        return {
            ticker,
            precoAtual,
            pvpTexto:pvp,
            pvpNumero:parseFloat(pvp?.replace(",", ".")),
            dy,
            ultimoProvento
        }

    }catch(e){
        console.log("Erro:", ticker)
        return null
    }
}

// ===============================
// 🧾 HTML
// ===============================

function gerarHtml(resultados, proporcoes, excluidos){

    let linhas=""

    const limite = 100 / 13

    const candidatosTop = resultados.filter(r=>{
        const prop = proporcoes[r.ticker]?.replace("%","").replace(",",".")
        const num = parseFloat(prop)
        return !num || num < limite
    })

    const top2 = [...candidatosTop]
        .sort((a,b)=> b.score - a.score)
        .slice(0,2)
        .map(r=>r.ticker)

    resultados.forEach(r=>{

        const preco = parseFloat(r.precoAtual.replace("R$","").replace(/\./g,"").replace(",","."))
        const provento = parseFloat(r.ultimoProvento.replace(/\./g,"").replace(",","."))
        const dyMensal = (provento / preco) * 100
        const dyAnual = dyMensal * 12

        const rendimento5000 = (dyMensal / 100) * 5000
        const rendimento10000 = (dyMensal / 100) * 10000

        const proporcaoStr = proporcoes[r.ticker.toUpperCase()] || "-"

        let classe = ""

        if(excluidos.has(r.ticker.toUpperCase())){
            classe = "excluido"
        }
        else if(top2.includes(r.ticker)){
            classe = "top"
        }
        else if(r.pvpNumero > 1){
            classe = "caro"
        }
        else if(dyAnual < 8){
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
<style>
body{font-family: Arial;background:#f4f8ff;padding:40px;}
table{border-collapse:collapse;width:1300px;margin:auto;}
th{background:#4a90e2;color:white;padding:12px;cursor:pointer;}
.seta{margin-left:5px;font-size:12px;}
td{padding:10px;text-align:center;}
tr:nth-child(even){background:#e6f0ff;}
tr:nth-child(odd){background:#ffffff;}
.top{background:#00e676 !important;font-weight:bold;}
.caro{background:#ffd6d6 !important;}
.baixoDy{background:#fff3b0 !important;}
.excluido{text-decoration:line-through;color:#888;background:#f0f0f0 !important;}
</style>
</head>

<body>

<h1>Scanner de FIIs</h1>

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
<th onclick="ordenarTabela(8)">% Carteira <span class="seta">↕</span></th>
<th onclick="ordenarTabela(9)">R$ 5.000 <span class="seta">↕</span></th>
<th onclick="ordenarTabela(10)">R$ 10.000 <span class="seta">↕</span></th>
</tr>
</thead>

<tbody>
${linhas}
</tbody>
</table>

<script>
let ordemAsc = true
let colunaAtual = -1

function limparValor(valor){
    valor = valor.replace("R$","").replace("%","").trim()
    if(valor.includes(",")){
        valor = valor.replace(/\\./g,"").replace(",",".")
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
    } else {
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
</script>

</body>
</html>
`

    fs.writeFileSync("resultado.html", html)

    const caminho = path.resolve("resultado.html")

    const comando =
        process.platform === "win32" ? `start "" "${caminho}"` :
        process.platform === "darwin" ? `open "${caminho}"` :
        `xdg-open "${caminho}"`

    exec(comando)
}

// ===============================
// 🚀 MAIN
// ===============================

async function main(){

    const fiis = lerFiis()

    console.log(`📊 ${fiis.length} FIIs carregados`)

    const proporcoes = lerProporcoes()
    const excluidos = lerExcluidos()

    const resultados = []

    for(const fii of fiis){
        const d = await processarFii(fii)
        if(d) resultados.push(d)
    }

    resultados.forEach(r=>{
        const dy = parseFloat(r.dy?.replace("%","").replace(",","."))
        let score = (dy / 100) * 0.7 + (1 / r.pvpNumero) * 0.3

        if(excluidos.has(r.ticker.toUpperCase())){
            score = 0
        }

        r.score = score
    })

    resultados.sort((a,b)=> b.score - a.score)

    gerarHtml(resultados, proporcoes, excluidos)
}

main()