const puppeteer = require("puppeteer")

function calcularMesesSemQuebra(historicoDividendos) {

    if (!historicoDividendos.length) {

        return {
            meses: 0,
            quebra: null
        }
    }

    const lista = historicoDividendos.map(function(h) {

        const valor = parseFloat(
            h.valor
                .replace(/\./g, "")
                .replace(",", ".")
        )

        return {
            dataCom: h.dataCom,
            valor: valor
        }
    })

    let meses = 1
    let quebra = null

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
            &&
            depois.valor <= atual.valor

        if (ehPicoTemporario) {

            meses++
            continue
        }

        quebra = proximo.dataCom
        break
    }

    return {
        meses: meses,
        quebra: quebra
    }
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

        console.log("📄 Página " + pagina)

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
                            dataCom: dataCom,
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
            ]?.dataCom

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

async function analisarFii(browser, ticker) {

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

        console.log("")
        console.log("🔍 Analisando " + ticker + "...")
        console.log(url)

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

        const historico =
            await extrairRendimentos(page)

        const resultado =
            calcularMesesSemQuebra(historico)

        console.log("✅ " + ticker + " finalizado")
        console.log("📈 Meses: " + resultado.meses)
        console.log("📦 Rendimentos: " + historico.length)

        if (resultado.quebra) {

            console.log("📉 Quebra: " + resultado.quebra)
        }
        else {

            console.log("✅ Sem quebra")
        }

        return {

            ticker: ticker,
            meses: resultado.meses,
            quebra: resultado.quebra,
            totalRendimentos: historico.length
        }

    } catch (e) {

        console.log("")
        console.log("❌ Erro em " + ticker)
        console.log(e.message)

        return {

            ticker: ticker,
            erro: true,
            mensagem: e.message
        }

    } finally {

        if (page) {

            try {
                await page.close()
            }
            catch (_) {}
        }
    }
}

async function analisarFiis(listaFiis) {

    if (!listaFiis) {
        listaFiis = []
    }

    const resultados = []

    for (const ticker of listaFiis) {

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

            const resultado =
                await analisarFii(browser, ticker)

            resultados.push(resultado)

        } catch (e) {

            resultados.push({

                ticker: ticker,
                erro: true,
                mensagem: e.message
            })

        } finally {

            if (browser) {

                try {
                    await browser.close()
                }
                catch (_) {}
            }
        }

        await new Promise(function(r) {
            setTimeout(r, 4000)
        })
    }

    resultados.sort(function(a, b) {

        return (b.meses || 0) - (a.meses || 0)
    })

    return resultados
}

module.exports = {

    analisarFiis: analisarFiis
}