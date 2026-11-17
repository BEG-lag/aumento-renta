# Fuentes, método y verificación

Todo número y toda regla de aumento·renta tiene una fuente oficial. Este documento dice cuál es, cuándo se consultó (17 de noviembre de 2026, salvo que se indique otra fecha), cómo se verificó y qué no se pudo verificar.

> **Advertencia.** Esta herramienta es informativa. No constituye opinión legal ni asesoría fiscal; valida con un abogado o la autoridad competente. Cuando una publicación oficial diga algo distinto, manda la publicación oficial.

Etiquetas: **[ESTIMADO]** cifra calculada o aproximada; **[SUPUESTO]** premisa no confirmada; **[BRECHA DE DATO]** información que falta.

## Contenido

| # | Sección | Estatus |
|---|---|---|
| 1 | [INPC: valores y publicación](#1-inpc-valores-y-publicación) | VERDE: verificado contra el DOF y contra INEGI |
| 2 | [UDIS: valores y publicación](#2-udis-valores-y-publicación) | VERDE: verificado contra las notas del DOF desde 2018 |
| 3 | [Fuentes con token que no se usan](#3-fuentes-con-token-que-no-se-usan) | VERDE |
| 4 | [Cálculo y redondeo](#4-cálculo-y-redondeo) | VERDE |
| 5 | [Qué meses se comparan](#5-qué-meses-se-comparan) | AMARILLO: convención, no regla legal |
| 6 | [Tope legal en la Ciudad de México (CCDF art. 2448 D)](#6-tope-legal-en-la-ciudad-de-méxico-ccdf-art-2448-d) | AMARILLO: texto verificado, interpretación abierta |
| 7 | [Otros estados](#7-otros-estados) | ROJO: no se revisan |
| 8 | [Actualización automática de los datos](#8-actualización-automática-de-los-datos) | VERDE |
| 9 | [Lo que no se pudo verificar](#9-lo-que-no-se-pudo-verificar) | AMARILLO |

## 1. INPC: valores y publicación

**Qué es.** El Índice Nacional de Precios al Consumidor lo elabora el INEGI (Ley del Sistema Nacional de Información Estadística y Geográfica, art. 59, fracc. III, inciso a) y se publica en el Diario Oficial de la Federación "dentro de los primeros diez días del mes siguiente al que corresponda" (Código Fiscal de la Federación, art. 20, segundo párrafo; texto de la Cámara de Diputados, última reforma DOF 09-04-2026, <https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf>). La base vigente es la **segunda quincena de julio de 2018 = 100**; el INEGI publicó el cambio de base en el DOF del 24 de agosto de 2018.

**Serie incluida** (`data/inpc.json`): enero de 2003 a octubre de 2026, 286 meses, un valor por mes.

| Periodo | Fuente | Cómo se obtuvo |
|---|---|---|
| ago. 2018 en adelante (99 meses) | Publicación mensual del INEGI en el DOF | API pública del SIDOF (Secretaría de Gobernación), sin cuenta ni token. Cada mes guarda la fecha y el número de la nota del DOF. |
| ene. 2003 a jul. 2018 (187 meses) | INEGI, datos abiertos del INPC mensual | <https://www.inegi.org.mx/contenidos/programas/inpc/2018/datosabiertos/inpc_indicador_mensual_csv.zip>, archivo `conjunto_de_datos_inpc_mensual.csv`, concepto "Precios al Consumidor (INPC)". |

Ejemplo de nota: INPC de octubre de 2026 = 147.026, DOF del 10/11/2026, nota 5803352, <https://dof.gob.mx/nota_detalle.php?codigo=5803352&fecha=10/11/2026>. El texto dice: "Con base en la segunda quincena de julio de 2018=100 el Índice Nacional de Precios al Consumidor del mes de octubre de 2026 es 147.026".

**Verificación.**

- Los 72 meses en que coinciden las dos fuentes (agosto de 2018 a julio de 2024) se compararon valor por valor: son idénticos.
- Cada nota del DOF también trae el índice del mes anterior y la variación mensual; el script recalcula la variación y compara el mes anterior con la serie. Así se detectó el único error encontrado: el DOF del 10/09/2018 (nota 5537424) publicó para agosto de 2018 **100.942** con variación de 4.90%. El INEGI lo corrigió con una **Nota aclaratoria** en el DOF del 11/09/2018 (nota 5537585): debe decir **100.492** y 0.58%. La app usa el valor corregido y enlaza la aclaración.
- Comprobación de plausibilidad: con estos valores la inflación anual de 2024 (dic. 2023 132.373 a dic. 2024 137.949) es 4.21%, la cifra que reportó el INEGI.

**Particularidades del archivo de datos abiertos del INEGI.**

- Está desactualizado: termina en julio de 2024 (`Last-Modified: 08 Aug 2024`). Por eso los meses recientes se leen del DOF.
- Su diccionario de datos dice que `VALOR` es la "variación porcentual anual", pero la columna `UNIDAD_MEDIDA` dice "Índice" y los valores son índices (por ejemplo, febrero de 2021 = 110.907). La app usa los valores como índices; el script falla si la unidad cambia.
- Los meses anteriores a agosto de 2018 son la serie reexpresada por el INEGI en base 2018, con hasta 12 decimales (julio de 2018 = 99.909099104514). La app los usa completos y los muestra con 6 decimales, avisando. En su momento, el DOF publicó esos meses en otra base (2a. quincena de diciembre de 2010 = 100); si un contrato antiguo cita esos valores, el factor puede diferir en el último decimal por el redondeo de la reexpresión.

**Cuándo se considera publicado un mes.** Desde agosto de 2018, la fecha real de su nota en el DOF (a veces el 8 o el 9 si el 10 cae en fin de semana). Antes, y para meses futuros, el plazo legal: el día 10 del mes siguiente (CFF art. 20). La app lo marca como fecha estimada. **[ESTIMADO]** para meses anteriores a agosto de 2018.

## 2. UDIS: valores y publicación

**Qué es.** El Banco de México da a conocer en el DOF el valor en pesos de la Unidad de Inversión para cada día, en dos publicaciones por mes: alrededor del día 10 (días 11 a 25) y del 25 (días 26 al 10 del mes siguiente), con fundamento en el artículo tercero del Decreto que establece las obligaciones que podrán denominarse en unidades de inversión y en el art. 20 Ter del CFF. Ejemplo: DOF del 10/11/2026, nota 5803350, valores del 11 al 25 de noviembre de 2026.

**Serie incluida** (`data/udis.json`): del 4 de abril de 1995 (valor 1.000000) al 25 de noviembre de 2026, 11,559 valores diarios sin huecos.

**Fuente.** API pública del SIDOF, indicador 159 (UDIS), `https://sidof.segob.gob.mx/dof/sidof/indicadores/159/{DD-MM-AAAA}/{DD-MM-AAAA}`, sin cuenta ni token. Documentación del endpoint verificada en el proyecto hermano [mcp-dof](https://github.com/BEG-lag/mcp-dof) (`docs/api.md`). Notas de cada periodo desde enero de 2018 (213 notas) por `GET /notas/{DD-MM-AAAA}` y `GET /notas/nota/{codNota}`.

**Verificación.**

- Cada valor del SIDOF desde 2018 se comparó con la tabla de la nota del DOF de su periodo: todos coinciden, y los periodos quedan contiguos, sin huecos ni traslapes.
- Saltos diarios mayores a 1% se tratan como error (el máximo real fue 0.33% en abril de 1995).
- El SIDOF tiene errores que el script resuelve con la nota del DOF del periodo:

| Día | SIDOF devolvió | DOF |
|---|---|---|
| 2004-07-25 | sin valor | 3.417744 |
| 2006-04-25 | 3.688459 y 117.419 | 3.688459 |
| 2006-11-14 | 3.761434 y 10.9263 | 3.761434 |
| 2007-02-25 | sin valor | 3.824791 |
| 2009-11-25 | 4.309396 y 4.316933 | 4.309396 |
| 2010-04-26 | 4.458790 y "5.0300%" | 4.458790 |
| 2012-07-15 | sin valor | 4.752686 |
| 2012-08-15 | 4.752686 y 4.780673 | 4.780673 |

- El SIDOF también devuelve valores con espacios sobrantes o sin ceros finales ("1.00384"); se normalizan a 6 decimales, como los imprime el DOF.
- Las notas del Banco de México usan varios formatos de fecha ("11-noviembre-2026", "12- noviembre-2009", "11-julio-20", "11 de agosto de 2022", "26/02/2020") y en una nota un valor viene partido ("6.4 51423"). El lector los reconoce todos y se prueba con notas reales en `test/fixtures`.

**Tamaño.** `data/udis.json` pesa 158 KB (46 KB con gzip) y se carga solo cuando eliges UDIS; `data/inpc.json` pesa 25 KB (5 KB con gzip) y va en el paquete principal (84 KB, 27 KB con gzip).

## 3. Fuentes con token que no se usan

- **INEGI, API del Banco de Información Económica (BIE)**: `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/{id}/...`. Requiere un token que se obtiene registrándose en el INEGI; sin token responde `ErrorCode:100`.
- **Banco de México, API del SIE** (series del INPC y de UDIS): requiere el encabezado `Bmx-Token`, que se obtiene registrándose.

No se crearon cuentas. Si en el futuro conviene usarlas (por ejemplo, para tener el INPC reexpresado completo y al día), bastaría guardar el token como secreto del repositorio.

## 4. Cálculo y redondeo

1. Los índices se usan exactamente como se publican, como texto decimal. No hay aritmética de punto flotante: todo es fracción exacta (`src/core/rational.ts`).
2. **Factor** = índice final ÷ índice inicial, exacto. Se muestra con 6 decimales, pero no se redondea dentro del cálculo.
3. **Renta actualizada** = renta × factor, redondeada **una sola vez** al centavo, mitad hacia arriba (redondeo comercial: $0.005 sube a $0.01).
4. Porcentajes: 2 decimales, mitad hacia arriba.
5. Tope de la CDMX: se usa la variación anual exacta del INPC y se muestra con dos decimales, como la reportan el INEGI y el Banco de México. Usar la cifra redondeada movería el tope a lo más 0.005 puntos porcentuales (60 centavos en una renta de $12,000).
6. Si el índice bajó, la renta actualizada es menor y la app lo dice. No se aplica el piso de 1 del art. 17-A del CFF, que es una regla fiscal.

El ejemplo del README se genera con el propio código (`scripts/readme-example.ts`) y una prueba falla si el README cambia. `test/calculate.test.ts` tiene casos calculados a mano con valores publicados.

## 5. Qué meses se comparan

La ley civil no fija qué meses del INPC se comparan para actualizar una renta; lo decide el contrato. La app ofrece cuatro convenciones y dice cuál usó:

| Convención | Meses | Fundamento |
|---|---|---|
| Últimos publicados (predeterminada) | El INPC más reciente publicado en el DOF a la fecha del aumento, contra el de tantos meses antes como haya entre las fechas | Práctica común en cláusulas de "actualización anual conforme al INPC". **[SUPUESTO]** |
| Mes anterior a cada fecha | El mes anterior a la fecha del aumento contra el mes anterior al inicio; si el primero no se ha publicado, el último publicado | CFF art. 17-A, párrafos primero y segundo (regla fiscal, aplicada por analogía) |
| Año anterior, dic. a dic. | Diciembre contra diciembre del año anterior al aumento | Es la "inflación anual" que se reporta |
| Elegir los meses | Los que diga el contrato | |

Si la fecha del aumento es futura y el índice que corresponde aún no se publica, el resultado se marca como **provisional** con el último índice disponible y la fecha en que debe publicarse el definitivo.

## 6. Tope legal en la Ciudad de México (CCDF art. 2448 D)

**Texto vigente.** Código Civil para el Distrito Federal (aplicable en la Ciudad de México), Libro Cuarto, Parte Segunda, Título Sexto "Del arrendamiento", Capítulo IV "Del arrendamiento de fincas urbanas destinadas a la habitación":

> ARTÍCULO 2448 D.- Para los efectos de este capítulo la renta deberá estipularse en moneda nacional y solo podrá ser aumentada anualmente.
>
> El incremento de la renta nunca será mayor a la inflación reportada por el Banco de México en el año anterior, respecto de la cantidad pactada como renta mensual.

**Publicación.** El segundo párrafo se reformó por el "Decreto por el que se reforma el segundo párrafo del artículo 2448 D y se adiciona un tercer y cuarto párrafo al artículo 2448 F, ambos numerales del Código Civil para el Distrito Federal y se modifican [...] la Ley de Vivienda para la Ciudad de México, en materia de rentas", publicado en la **Gaceta Oficial de la Ciudad de México núm. 1433, 28 de agosto de 2024, Sección 1a., página 4**. Aprobado por el Congreso de la Ciudad de México (II Legislatura) el 22 de agosto de 2024 y promulgado el 26 de agosto de 2024. **Entró en vigor el 29 de agosto de 2024** (artículo Segundo transitorio: "al día siguiente de su publicación").

Fuentes consultadas:

- Páginas 4 a 6 de la Gaceta, copia de la PAOT: <https://paot.org.mx/centro/codigos/df/pdf/2024/GOCDMX_28_08_2024_4.pdf>
- Síntesis de la Gaceta del 28/08/2024 de la SCJN (confirma número de edición y página): <https://www.scjn.gob.mx/sites/default/files/sintesis_dof_gocdmx/documento/2024-08/GOCDMX%2028082024%20S%C3%8DNTESIS.pdf>
- Texto vigente compilado por la PAOT, última reforma publicada el 24 de diciembre de 2025: <https://paot.org.mx/centro/codigos/df/pdf/2026/CODIGO_CIVIL_PARA_DF_24122025.pdf>. Las reformas posteriores a agosto de 2024 que lista la PAOT (29/11/2024, 27/08/2025, 28/10/2025, 21/11/2025, 24/12/2025) se revisaron una por una: ninguna toca los artículos 2448 a 2448 L.

**Texto anterior** (hasta el 28 de agosto de 2024), según la compilación de la Consejería Jurídica de la CDMX (archivo de 2022): "En aquellos contratos en que el importe de la renta mensual no exceda de a 5,400 veces la Unidad de Cuenta de la Ciudad de México vigente y no exceda de 9,000 veces la Unidad de Cuenta de la Ciudad de México vigente; el incremento no podrá exceder del 10% de la cantidad pactada como renta mensual." La app no evalúa aumentos anteriores al 29 de agosto de 2024 y lo dice.

**Artículos relacionados** (mismo capítulo, texto vigente): el art. 2448 declara estas disposiciones de orden público e interés social, irrenunciables; el 2448 C fija una duración mínima de un año; el 2448 E limita el depósito a una mensualidad; el 2448 F, reformado en el mismo decreto, ordena registrar los contratos en un registro digital del Gobierno de la Ciudad dentro de 30 días.

**Cómo lo aplica la app.**

- Solo si el inmueble está en la CDMX, es vivienda y el aumento es a partir del 29 de agosto de 2024.
- "Inflación reportada por el Banco de México": desde 2011 el INPC lo calcula el INEGI y el Banco de México reporta la inflación con ese índice; la app usa el INPC del INEGI publicado en el DOF. Algunos despachos han señalado esta imprecisión de la reforma.
- "En el año anterior": la ley no aclara si es el año calendario anterior (diciembre a diciembre) o los 12 meses previos al aumento. La app muestra **las dos lecturas** y dice si la propuesta está dentro de ambas, fuera de ambas o depende de la lectura. No elige por el usuario.
- "Solo podrá ser aumentada anualmente": si entre las fechas hay menos de 12 meses, la app avisa. Si hay más, avisa que la ley no aclara si se acumulan aumentos no aplicados y compara con un solo año. **[SUPUESTO]** de que el tope es anual.
- No se aplica a locales u oficinas, y no limita otros cobros (mantenimiento, servicios).
- Contratos de vivienda en UDIS: el primer párrafo exige que la renta se estipule en moneda nacional. Si tu contrato de vivienda en la CDMX está en UDIS, valida con un abogado cómo se relaciona con esa regla. La app compara la actualización por UDIS contra el mismo tope del INPC.

**Iniciativa en trámite.** Según notas de prensa de octubre y noviembre de 2026, la Jefa de Gobierno presentó una iniciativa de "Ley de Relaciones Inquilinarias y Rentas Justas, Razonables y Asequibles" que mantendría el tope por inflación con referencia al INEGI, entre otros cambios; se turnó a comisiones del Congreso local y hubo mesas de diálogo del 6 al 17 de noviembre de 2026. Al 17 de noviembre de 2026 no se encontró aprobación ni publicación en la Gaceta. **[SUPUESTO]**: no verificado en fuente oficial. Si se publica, hay que revisar este documento y `src/core/calculate.ts`.

## 7. Otros estados

La app **no** revisa los códigos civiles de otros estados. Si eliges "Otro estado", solo calcula la actualización y dice que las reglas de tu estado pueden ser distintas. **[BRECHA DE DATO]**: reglas de aumento de renta en las otras 31 entidades.

## 8. Actualización automática de los datos

`.github/workflows/update-data.yml` corre los días 8 a 13 y 24 a 27 de cada mes y cada lunes, a las 9:17 de la Ciudad de México. Ejecuta `scripts/update-data.ts`, que:

1. Busca en el DOF (vía SIDOF) la nota del INEGI del mes que falta, empezando por el día 10, y verifica la variación y el mes anterior; si algo no cuadra, busca una nota aclaratoria.
2. Vuelve a leer los últimos 45 días de UDIS (no deben cambiar), agrega los nuevos y verifica cada valor contra la nota del Banco de México de su periodo.
3. Si hay cualquier inconsistencia, falla sin escribir nada (GitHub avisa por correo al dueño del repositorio).
4. Solo si cambió algún valor: corre las pruebas, hace commit de `data/` como `github-actions[bot]` y vuelve a publicar el sitio.

Para reconstruir todo desde cero: `npm run data:backfill` (unas mil solicitudes al SIDOF, con pausa de 300 ms entre cada una y caché en `.cache/`).

## 9. Lo que no se pudo verificar

- **Número oficial de la Gaceta en el portal de la Consejería Jurídica.** Se verificó el texto en la copia de la PAOT (páginas 4 a 6) y el número de edición (1433) en la síntesis de la SCJN; no se localizó el PDF completo de esa edición en el portal de la Consejería. **[BRECHA DE DATO]**
- **Reformas de 2026 al Código Civil.** La compilación más reciente encontrada es de la PAOT con última reforma del 24/12/2025. Una nota de despacho menciona una reforma al art. 1834 publicada el 20/08/2026, que no toca el arrendamiento. No se revisaron otras publicaciones de 2026. **[SUPUESTO]**: el art. 2448 D no cambió en 2026.
- **Estado de la iniciativa de Ley de Rentas Justas** (sección 6): solo notas de prensa.
- **Interpretación de "año anterior" y de la acumulación de aumentos**: no hay criterio judicial localizado; por eso la app muestra ambas lecturas.
- **Meses del INPC anteriores a agosto de 2018**: se usan los valores reexpresados del INEGI; no se compararon con las publicaciones originales del DOF en base 2010.
- **UDIS anteriores a 2018**: vienen del SIDOF; solo los ocho días anómalos de la tabla se verificaron contra su nota del DOF.
