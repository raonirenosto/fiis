const axios = require("axios")
const puppeteer = require("puppeteer")

// ===============================
// 📡 BUSCAR VIA API (rápido)
// ===============================

async function buscarRendimentosApi(ticker) {

    const url = "https://statusinvest.com.br/fii/companytickerprovents"

    const response = await axios.get(url, {
        params: { ticker, chartProvidentType: 2 },
        headers: { "User-Agent": "Mozilla/5.0" }
    })

    const dados = response.data.assetEarningsModels || []

    return dados
        .filter(d => d.et === "Rendimento")
        .map(d => ({ data: d.ed, valor: d.v }))
}

// ===============================
// 🌐 BUSCAR VIA PUPPETEER (completo)
// ===============================

function calcularMesesSemQuebra(rendimentos) {

    if (rendimentos.length < 3) {
        return { meses: rendimentos.length, quebra: null }
    }

    const lista = rendimentos.map(function(h) {

        const valor = typeof h.valor === "number"
            ? h.valor
            : parseFloat(h.valor.replace(/\./g, "").replace(",", "."))

        return { data: h.data, valor }
    })

    let meses = 1

    for (let i = 0; i < lista.length - 2; i++) {

        const atual = lista[i]
        const proximo = lista[i + 1]
        const depois = lista[i + 2]

        if (atual.valor >= proximo.valor) {
            meses++
            continue
        }

        const ehPicoTemporario =
            proximo.valor > atual.valor
            && depois.valor <= atual.valor

        if (ehPicoTemporario) {
            meses++
            continue
        }

        return { meses, quebra: proximo.data }
    }

    return { meses: lista.length, quebra: null }
}

async function lerTabelaDividendos(page) {

    return await page.evaluate(function() {

        const linhas =
            Array.from(
                document.querySelectorAll("table tbody tr")
            )

        return linhas.map(function(linha) {

            return Array.from(
                linha.querySelectorAll("td")
            ).map(function(td) {

                return td.innerText.trim()
            })
        })
    })
}

async function extrairRendimentos(page) {

    const historicoDividendos = []
    const registros = new Set()

    let pagina = 1
    let continuar = true

    while (continuar) {

        await new Promise(function(r) {
            setTimeout(r, 3000)
        })

        const linhas =
            await lerTabelaDividendos(page)

        let encontrouNaPagina = 0

        for (const cols of linhas) {

            if (cols.length >= 4) {

                const tipo = cols[0]
                const dataCom = cols[1]
                const pagamento = cols[2]
                const valor = cols[3]

                const ehData =
                    /^\d{2}\/\d{2}\/\d{4}$/.test(dataCom)

                const ehValor =
                    /^[0-9.,]+$/.test(valor)

                if (
                    tipo.toUpperCase().includes("RENDIMENTO")
                    && ehData
                    && ehValor
                ) {

                    const chave =
                        dataCom + "-" + pagamento + "-" + valor

                    if (!registros.has(chave)) {

                        registros.add(chave)

                        historicoDividendos.push({
                            data: dataCom,
                            pagamento: pagamento,
                            valor: valor
                        })

                        encontrouNaPagina++
                    }
                }
            }
        }

        const primeiroAntes =
            historicoDividendos[
                historicoDividendos.length - encontrouNaPagina
            ]?.data

        const paginaAlvo = pagina + 1

        const clicou = await page.evaluate(function(paginaAlvo) {

            const elementos =
                Array.from(
                    document.querySelectorAll("a, button")
                )

            const botao =
                elementos.find(function(el) {

                    const texto =
                        el.innerText
                        ? el.innerText.trim()
                        : ""

                    return texto === paginaAlvo.toString()
                })

            if (!botao) {
                return false
            }

            const disabled =
                botao.disabled
                || botao.classList.contains("disabled")

            if (disabled) {
                return false
            }

            botao.scrollIntoView({
                behavior: "instant",
                block: "center"
            })

            botao.click()

            return true

        }, paginaAlvo)

        if (!clicou) {
            break
        }

        pagina++

        if (pagina > 20) {
            break
        }

        try {

            await page.waitForFunction(

                function(primeiroAntes) {

                    var linhas =
                        Array.from(
                            document.querySelectorAll("table tbody tr")
                        )

                    for (var i = 0; i < linhas.length; i++) {

                        var cols =
                            Array.from(
                                linhas[i].querySelectorAll("td")
                            ).map(function(td) {
                                return td.innerText.trim()
                            })

                        if (cols[1] === primeiroAntes) {
                            return false
                        }
                    }

                    return true
                },

                { timeout: 10000 },

                primeiroAntes
            )

        } catch (e) {

            continuar = false
        }

        await new Promise(function(r) {
            setTimeout(r, 2000)
        })
    }

    return historicoDividendos
}

async function buscarRendimentosPuppeteer(browser, ticker) {

    let page = null

    try {

        page = await browser.newPage()

        await page.setViewport({
            width: 1600,
            height: 900
        })

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/137.0.0.0 Safari/537.36"
        )

        await page.setExtraHTTPHeaders({
            "accept-language": "pt-BR,pt;q=0.9"
        })

        await page.evaluateOnNewDocument(function() {

            Object.defineProperty(navigator, "webdriver", {

                get: function() {
                    return false
                }
            })
        })

        const url =
            "https://statusinvest.com.br/fundos-imobiliarios/"
            + ticker.toLowerCase()

        await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 60000
        })

        await new Promise(function(r) {
            setTimeout(r, 5000)
        })

        await page.evaluate(function() {

            var tabelas =
                Array.from(document.querySelectorAll("table"))

            if (tabelas.length > 0) {

                tabelas[0].scrollIntoView({
                    behavior: "instant",
                    block: "center"
                })
            }
        })

        await new Promise(function(r) {
            setTimeout(r, 3000)
        })

        const historico = await extrairRendimentos(page)

        return historico

    } finally {

        if (page) {
            try { await page.close() } catch (_) {}
        }
    }
}

// ===============================
// 🚀 ANALISAR FIIs
// ===============================

async function analisarFiis(listaFiis) {

    if (!listaFiis) return []

    const resultados = []
    const precisaPuppeteer = []

    // Fase 1: API (instantânea)
    for (const ticker of listaFiis) {

        try {

            const rendimentos = await buscarRendimentosApi(ticker)
            const resultado = calcularMesesSemQuebra(rendimentos)

            if (resultado.quebra) {

                console.log(`✅ ${ticker} — ${resultado.meses} meses (quebra: ${resultado.quebra})`)

                resultados.push({
                    ticker,
                    meses: resultado.meses,
                    quebra: resultado.quebra,
                    totalRendimentos: rendimentos.length
                })

            } else {

                precisaPuppeteer.push(ticker)
            }

        } catch (e) {

            precisaPuppeteer.push(ticker)
        }
    }

    // Fase 2: Puppeteer (só para quem não teve quebra na API)
    if (precisaPuppeteer.length > 0) {

        console.log(`⏳ ${precisaPuppeteer.length} FIIs precisam de histórico completo...`)

        let browser = null

        try {

            browser = await puppeteer.launch({
                headless: true,
                ignoreHTTPSErrors: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-web-security",
                    "--disable-features=IsolateOrigins",
                    "--disable-blink-features=AutomationControlled",
                    "--window-position=-2400,-2400"
                ]
            })

            for (const ticker of precisaPuppeteer) {

                try {

                    console.log(`🔍 ${ticker}...`)

                    const historico = await buscarRendimentosPuppeteer(browser, ticker)
                    const resultado = calcularMesesSemQuebra(historico)

                    const info = resultado.quebra ? `(quebra: ${resultado.quebra})` : "(sem quebra)"
                    console.log(`✅ ${ticker} — ${resultado.meses} meses ${info}`)

                    resultados.push({
                        ticker,
                        meses: resultado.meses,
                        quebra: resultado.quebra,
                        totalRendimentos: historico.length
                    })

                } catch (e) {

                    console.log(`❌ ${ticker}: ${e.message}`)
                    resultados.push({ ticker, erro: true, mensagem: e.message })
                }

                await new Promise(function(r) {
                    setTimeout(r, 4000)
                })
            }

        } finally {

            if (browser) {
                try { await browser.close() } catch (_) {}
            }
        }
    }

    resultados.sort(function(a, b) {
        return (b.meses || 0) - (a.meses || 0)
    })

    return resultados
}

module.exports = { analisarFiis }
