# Robô de transparência — Câmara Municipal de Lagarto/SE

Programa que, uma vez por dia, lê as pastas de documentos que a Câmara Municipal de Lagarto publica no
[portal da Ágape](https://portal.sitesagapesistemas.com.br/agape2/portal/?alias=cmlagarto) e gera uma lista
organizada em [`docs/agape.json`](docs/agape.json).

As páginas de transparência do portal da Câmara (https://www.lagarto.se.leg.br) leem esse arquivo para mostrar
sempre os documentos mais recentes — RGF, balanço, relatórios de gestão, julgamentos do TCE, PCA, notas
explicativas etc. — e atender aos critérios do [Serigy/TCE-SE](https://serigy.tce.se.gov.br).

Todas as informações coletadas já são públicas.

- **Quando roda:** todo dia às 6h (horário de Sergipe), pelo GitHub Actions. Também pode ser rodado na hora em
  *Actions → Coletar documentos da Ágape → Run workflow*.
- **Onde fica o resultado:** https://abelgomes.github.io/cml-serigy-robo/agape.json
- **Para acompanhar outra pasta da Ágape:** acrescente-a na lista `PASTAS` em `robo/coletar-agape.mjs`.
- **Se a Ágape falhar:** o robô mantém a última lista boa e marca o erro na pasta correspondente.
