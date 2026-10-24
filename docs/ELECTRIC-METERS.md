# Electric meter serial numbers

Source: the Don Orestes Romualdez Electric Cooperative "Calibration Test Result (1 Phase KWHM - New)" sheets for the market, 27 August – 29 September 2026. The office holds these serials to be the final meter numbers, so the sheets' Findings column is not used.

The data is in `src/market/meters.ts`: every row as printed (`CALIBRATION_ROWS`), and which directory vendor each row belongs to (`ROW_OWNERS`). On starting afresh from the Market Stall Directory, each tenant record takes its stall's meter as its electricity meter number, and utility billing fills it in when the stall is chosen. Every serial below is also offered in the meter number boxes, by number or name.

**How meters are given to stalls.** When someone was calibrated on more than one date, the latest date's meter is used — a re-test replaced the meter tested before it. A vendor with several stalls gets those meters on their stalls in stall-number order; the sheets do not say which stall a meter is on, so a stall left over has no meter yet.

**203 rows** on 12 sheets · **152** matched to 106 directory vendors · **107 of 156 tenant records** have a meter.

## To check

- **Same serial printed for two people:**
  - `25007361298` — CAPISTRANO, JIMMY (9/15, IZUKI) and YEPES, OSCAR (9/15, IZUKI)
  - `25007361304` — ORINGO, JAIME (9/18, IZUKI) and DADIZON, JOY (9/21, SAFARI)
- **Serial printed identical to its ERC seal number:** `19L030423511`, Cervantes, Jose (9/18). It is used for Percival Cervantes (CS-30); his 9/17 meter was `202392186027I`.
- **Unusual length:** `5487457` (Magdua, Alwin, 9/17) and `5866952` (Vellero, Jetro, 9/15) have seven digits where every other CLADEN serial has six.
- **On a crease in the photo:** `2536291I` (BAÑEZ), `491236` (CERVANTES, NEIL), `577353` (CANRINO, MARITES), `26015351` (ALMADEN, JOHNNIFER), `2023-030092202` (ESLABAN, JULIFE), `2411110520` (ARCENA, BABAY JANE) — one digit of each lies on the fold of the 9/4 continuation page; the reading was compared across two photographs.

## Stalls with a meter

| Stall | Tenant | Meter serial | Brand | From the sheet of |
| --- | --- | --- | --- | --- |
| CS-29 | Alwin Magdua | `5487457` | CLADEN | 9/17 (row 1: MAGDUA, ALWIN) |
| CS-30 | Percival Cervantes | `19L030423511` | IZUKI | 9/18 (row 7: CERVANTES, JOSE) |
| CS-32 | Jetro Villero | `5866952` | CLADEN | 9/15 (row 15: VELLERO, JETRO) |
| CS-37 | Baby J Arcena | `586957` | CLADEN | 9/11 (row 2: ARCENA, BABY JEAN) |
| CS-39 | Eileen Dapitan | `587453` | CLADEN | 9/17 (row 3: DAPITAN, ELAINE) |
| CS-41 | Marites Laurino | `577353` | CLADEN | 9/4 (row 53: CANRINO, MARITES) |
| CS-44 | Eliza Tizon | `2105274298I` | SAFARI | 9/4 (row 37: TIZON, E) |
| CS-45 | Vilma Lanza | `202309490143I` | SAFARI | 9/4 (row 36: LANZA, VILMA) |
| CS-46 | Chritine Ripalda | `220077512` | SAFARI | 9/4 (row 30: RIPALDA) |
| CS-47 | Martha Lonzaga | `26006428740` | IZUKI | 9/15 (row 20: LONSAGA, MARTHA) |
| CS-48 | Jennifer Almaden (P) | `26015351` | PROSEAL | 9/4 (row 55: ALMADEN, JOHNNIFER) |
| CS-49 | Celeste Banez (P) | `587797` | CLADEN | 9/15 (row 14: BANEÑEZ, CELESTE) |
| DS-5 | Operio Jenefer | `23040184265` | IZUKI | 9/9 (row 10: OPERIO, JENEFER) |
| DS-6 | Caimoy Genevieve | `2304018490I` | IZUKI | 9/9 (row 8: CAIMOY, GENEVIEVE) |
| DS-171 | Lancaran Isabelita | `26006428650` | IZUKI | 9/18 (row 14: LANCANAN, ISABELITA) |
| DS-178 | Julife Esjaban | `2023-030092202` | OPPO | 9/4 (row 56: ESLABAN, JULIFE) |
| DS-179 | Ervin Peralta | `202303009733` | OPPO | 9/11 (row 26: PERALTA, ERVIN) |
| DS-206 | Joy Dadizon | `25007361304` | SAFARI | 9/21 (row 3: DADIZON, JOY) |
| FD-7 | Cinco Jacquiline | `202205305666I` | SAFARI | 9/9 (row 1: CINCO, JACQUILINE) |
| FD-9 | Ladan Mae Merlyn | `23040184267` | IZUKI | 9/9 (row 18: LADAN, FRUITS) |
| FD-10 | Ladan Mae Merlyn | `23040184264` | IZUKI | 9/9 (row 23: LADAN, FRUITS) |
| FS-105 | Gloria Aguilar | `23040186521` | IZUKI | 9/4 (row 19: AGUILAR, GLORIA) |
| FS-106 | Felisa Abas | `2023-03009737` | OPPO | 9/11 (row 6: ABAS, FELISA) |
| FS-108 | Marilyn Candela | `202303009738` | OPPO | 9/11 (row 38: CANDELA, MARELYN) |
| FS-111 | Melba Melo | `20220550562I` | SAFARI | 9/4 (row 15: MELO, MELBA) |
| FS-112 | Abelardo Pardales | `202303009734` | OPPO | 9/11 (row 27: PARDALES, ABELARDO) |
| FS-113 | Merly Baguisa | `202303009730` | OPPO | 9/11 (row 24: BAQUISA, MERYL) |
| FS-114 | Colita Baguisa | `205069930I` | TOSHIBA | 9/4 (row 47: BAGUISA, COLITA) |
| FS-115 | Daniel Tomanda | `202303009724` | OPPO | 9/11 (row 25: TOMANDA, DANIEL) |
| FS-117 | Corazon Dela Cruz | `20219528948I` | SAFARI | 9/4 (row 20: DELA CRUZ, CORAZON) |
| FS-119 | Mary Ann Salano | `26012B631591` | SAFARI | 9/21 (row 2: SALAÑO, JEFER JOHN) |
| FS-120 | Nilda Ubaldo | `202392137208I` | SAFARI | 9/9 (row 19: UBALDO, NILDA) |
| FS-121 | Eric Vertudez | `586946` | CLADEN | 9/11 (row 3: VERTUDES, ERIC) |
| FS-126 | Regine Garcia | `587758` | CLADEN | 9/4 (row 24: GARCIA, REGINE) |
| FS-130 | Janith Cinco | `210527309I` | SAFARI | 9/11 (row 19: CINCO, JANITH) |
| FS-133 | Sandro Aguillon | `105275182I` | SAFARI | 9/9 (row 15: AGUILLO, SANDRO) |
| FS-134 | Princess Plaba | `587741` | CLADEN | 9/11 (row 36: PLABA, PRINCESS) |
| FS-135 | Ma. Clariss Aguillon | `586942` | CLADEN | 9/11 (row 5: AGULLON, MA. CLARISS) |
| FS-136 | Charina Ordame | `586960` | CLADEN | 9/11 (row 4: ORDAME, CHARINA) |
| FS-138 | Alma Abanag | `586854` | CLADEN | 9/15 (row 10: ABANAG, ALMA) |
| FS-139 | Laila Barcilla | `586944` | CLADEN | 9/11 (row 1: BARCILLA, LAILA) |
| FS-140 | Jovita Plaba | `587786` | CLADEN | 9/18 (row 2: PLABA, JOVITA) |
| FS-141 | Dennis Abano | `587781` | CLADEN | 9/15 (row 16: ABAÑO, DENNIS) |
| FS-142 | Haide Abano | `587785` | CLADEN | 9/18 (row 1: ABAÑO, HAIDE) |
| FS-143 | John Drandreb Gerilla | `586848` | CLADEN | 9/15 (row 2: GERILLA, JOHN DRANREB) |
| FS-145 | Reshile Labrado | `202205305422I` | SAFARI | 9/4 (row 11: CABRADO, RESHILE) |
| FS-146 | Benecio Costimiano | `20239477896I` | SAFARI | 9/4 (row 25: COSTIMIADO, BENECO) |
| FS-147 | Karen Laurente | `23040186514` | IZUKI | 9/4 (row 17: LAUTENTE, KAREN) |
| FS-149 | Rine Ordame | `586853` | CLADEN | 9/11 (row 33: ORDAME, RINE) |
| KS-2 | Narcisa Redona | `201919080858` | SAFARI | 9/11 (row 16: REDOÑA, NARCISA) |
| KS-4 | Jade Modesto | `WJF95902029` | VOSHTECH | 8/27 (row 5: MODESTO, BELEN / Jade) |
| KS-76 | Rosario Elardo | `WJF95902034` | VOSHTECH | 8/27 (row 4: ELARDO, ROSARIO) |
| KS-77 | Joel Arellano | `587789` | CLADEN | 9/16 (row 7: ARELLANO, JOEL) |
| KS-78 | Marthy Medrano | `972205` | SAFARI | 8/27 (row 8: MEDRANO, MARTHY) |
| KS-79 | Catherine Flores | `202392137669I` | SAFARI | 9/11 (row 17: FLORES, CATHERINE) |
| KS-80 | Jacquiline Flores | `587247` | CLADEN | 9/18 (row 13: FLORES, JACQUILINE) |
| KS-81 | Rhodora Cesar | `WJF095902025` | VOSHTECH | 8/27 (row 3: CESAR, RHODORA) |
| MS-15 | Romeo Lipayon | `582655` | CLADEN | 9/24 (row 2: LIPAYAN, ROMEO) |
| MS-19 | Leymar Loteyro | `OY020259630004I` | SAFARI | 8/27 (row 7: LOTEYRO, LEE MAR) |
| MS-20 | Nida Salve | `202205304699I` | SAFARI | 9/4 (row 35: SALVE, NIDA) |
| MS-22 | Fatima Gaven | `586856` | CLADEN | 9/15 (row 21: GEVEN, MA. FATIMA) |
| MS-23 | Desiderio Camero | `25008363698` | IZUKI | 9/15 (row 6: CAMERO, DESIDERIO) |
| MS-26 | Regiie Bigoy | `587449` | CLADEN | 9/18 (row 10: BIGOY, REGIE) |
| MS-27 | Aiza Odtuhan | `532654` | CLADEN | 9/24 (row 1: ODTOHAN, AIZA) |
| MS-50 | Jingjing Terado | `202592449629I` | SAFARI | 9/11 (row 32: TERRADO, JINGJING) |
| MS-51 | C Godwin Magdua | `587450` | CLADEN | 9/17 (row 2: MAGDUA, CHARLES) |
| MS-52 | Mary Ann Almaden | `587796` | CLADEN | 9/15 (row 1: ALMADEN, MARY ANN) |
| MS-53 | Leo Lanza | `587794` | CLADEN | 9/15 (row 12: LANZA, LEO) |
| MS-55 | Ronalyn Bigoy | `587455` | CLADEN | 9/17 (row 5: BIGOY, RONALYN) |
| MS-57 | Jaime Oringo | `25007361304` | IZUKI | 9/18 (row 3: ORINGO, JAIME) |
| MS-61 | Gerry Lipayon | `587790` | CLADEN | 9/15 (row 13: LIPAYON, GERRY) |
| VS-11 | Duquilla Irene | `201703600004916` | CHINT | 9/9 (row 29: DOQUIILA, IRENE) |
| VS-12 | Basihan Josephine | `202209387775` | SAFARI | 9/11 (row 15: BASIHAN, JOSEPHINE) |
| VS-13 | Camposano Lisa | `2023-03009727` | OPPO | 9/15 (row 19: CAMPOSANO, LISA) |
| VS-14 | Marabut Myra | `202209387294I` | SAFARI | 9/9 (row 11: MARABOT, MYRA) |
| VS-63 | Dulce Duzon | `587259` | CLADEN | 9/18 (row 11: DUZON, DULCE) |
| VS-64 | Vertudes Kate | `202209386991I` | SAFARI | 9/11 (row 31: VERTUDEZ, KATE) |
| VS-88 | Anos Diane | `26004418932` | IZUKI | 9/16 (row 1: ANOS, DIANE) |
| VS-89 | Martos Sylvia | `105274289I` | SAFARI | 9/4 (row 45: MARTOS, SILVIA) |
| VS-90 | Pelino Florentina | `23040184897` | IZUKI | 9/4 (row 43: PELENIO) |
| VS-91 | Magdua Genevieve | `587782` | CLADEN | 9/16 (row 6: MAGDUA, GENEVIEVE) |
| VS-92 | Guardaya Ma. Lourcel | `KW202309489208I` | SAFARI | 9/1 (row 1: GUARDAYA, LOURCEL) |
| VS-94 | Gasing Nestor | `587244` | CLADEN | 9/18 (row 12: GASING N) |
| VS-159 | Villero Crisanta | `202209386981I` | SAFARI | 9/4 (row 44: VILLERO, CRISANTE) |
| VS-161 | Villero Ester | `202209386983I` | SAFARI | 9/4 (row 39: VILLERO, ESTER) |
| VS-162 | Albao Darwin | `KW2025929810961` | SAFARI | 9/18 (row 4: ALBAO, DARWIN) |
| VS-163 | Podol Ramil | `587788` | CLADEN | 9/16 (row 9: PODOL, RAMIL) |
| VS-164 | Udtohan Neil | `WJF95902040` | VOSHTECH | 8/27 (row 10: UDTOHAN, NEIL) |
| VS-165 | Vilma Garcia | `210527189I` | SAFARI | 9/11 (row 7: GARCIA, VELMA) |
| VS-166 | Paranas Lyn | `2022093873121I` | SAFARI | 9/9 (row 22: PARAMAS, LYNN) |
| VS-167 | Tolibas Roslyn | `202209387788I` | SAFARI | 9/9 (row 2: TOLIBAS, ROSELYN) |
| VS-168 | Lagarto Mary Jean | `23080202423` | IZUKI | 9/11 (row 9: LAGARTO, MARY JEAN) |
| VS-169 | Sheryl Zialcita | `26004418938` | IZUKI | 9/16 (row 2: ZIALCITA, SHERYL) |
| VS-188 | Amistoso Jonathan | `202209387792I` | SAFARI | 9/9 (row 21: AMISTOSO, JOANTHAN) |
| VS-189 | Dumalaoron Estelita | `23040184899` | IZUKI | 9/9 (row 12: DUMALAORON, ESTIELITA) |
| VS-190 | Royeras Francisco | `202205305864I` | SAFARI | 9/9 (row 24: ROYERAS, FRANCISCO) |
| VS-191 | Camino Cheenee | `25008364107` | IZUKI | 9/15 (row 8: CAMINO, CHENEE) |
| VS-193 | Menaya Roy | `202205304684I` | SAFARI | 9/9 (row 9: MENAYA, ROY) |
| VS-194 | Lamoste Rey | `587792` | CLADEN | 9/15 (row 11: LAMOSTE, REY) |
| VS-195 | Karen G Villegas | `202209386979I` | SAFARI | 9/16 (row 5: VILLEGAS, KAREN) |
| VS-196 | Olguira Angeila Ca Mae | `202205304694I` | SAFARI | 9/9 (row 6: OLGISERA, Angelica) |
| VS-197 | Yepes Oscar | `25007361298` | IZUKI | 9/15 (row 7: YEPES, OSCAR) |
| VS-198 | Cordero Ma. Nilda | `202209387785I` | SAFARI | 9/9 (row 4: CORDERO, NILDA) |
| VS-199 | Solano Wilson | `202209387779I` | SAFARI | 9/9 (row 3: SOLANO, WILSON) |
| VS-203 | Nerja Nerly | `25007361296` | IZUKI | 9/16 (row 3: NERJA, NERLY) |
| VS-204 | Madelyn Canayon | `23040184898` | IZUKI | 9/4 (row 41: CANAYON, M) |
| VS-205 | Estember Cheremae | `202209387311I` | SAFARI | 9/4 (row 31: ESTEMBER, CHERIE) |

## Stalls without a meter yet

CS-28 Joy Almaden (P) · CS-31 Solidad Cervantes · CS-33 Jetro Villero · CS-34 Ashley Magdua · CS-38 Baby J Arcena · CS-40 Eileen Dapitan · DS-73 Operio Jenefer · DS-173 Florita Soriano · FD-8 Saclay Julieta · FD-68 Ladan Mae Merlyn · FD-69 Ladan Mae Merlyn · FD-70 Saclay Julieta · FD-71 Cinco Jacquiline · FD-84 Cinco Jocelyn · FD-85 Cinco Jocelyn · FD-86 Ponferada Victoriano · FD-87 Ponferada Victoriano · FS-107 Joey Abando · FS-109 Melvin Flores · FS-110 Renalyn Melo · FS-116 Milo Duzon · FS-118 Lyza Dela Cruz · FS-131 Janith Cinco · FS-137 Danilo Abanag · FS-144 John Drandreb Gerilla · FS-148 Ricardo Ordame · KS-1 Norida Lerios · KS-3 Mary Joy Aguillon · MS-16 Lorena Lipayon · MS-17 Fernando Borrel · MS-18 Gemma Gamez · MS-21 Nida Salve · MS-54 Leo Lanza · MS-56 Ronalyn Bigoy · MS-58 Jaime Oringo · MS-59 Caroline Emoylan · MS-60 Caroline Emoylan · MS-62 Leodegario Gerilla · VS-93 Telemban Esmeralda · VS-160 Modesto Jade · VS-170 Salcedo Sofia Mae · VS-182 Salcedo Shaine Marie · VS-184 Garcia Roberto III · VS-185 Rellona Evangeline · VS-187 Blase Maricel · VS-192 Marabut Mylene · VS-200 Boco Ria · VS-201 Dangco Jamel Rose · VS-202 Catan Rosario

## Earlier meters on the sheets

Matched to a vendor but not used, because a later sheet has them, or because the vendor has more meters than stalls on record. Where a vendor holds a stall that has no meter yet, one of these may be that stall's.

| Vendor | Stalls | Meter serial | Sheet of |
| --- | --- | --- | --- |
| Joy Dadizon | DS-206 | `LGT202593029276I` | 8/27 (row 6: DADIZON, JOY) |
| Eric Vertudez | FS-121 | `587316` | 8/27 (row 9: VERTUDES, ERIC) |
| Marilyn Candela | FS-108 | `2536274I` | 9/4 (row 5: CANDELA, MARILYN) |
| Jovita Plaba | FS-140 | `202492390548I` | 9/4 (row 6: PLABA, JOVITA) |
| Princess Plaba | FS-134 | `202205305653I` | 9/4 (row 7: PLABA, PRINCESS) |
| Laila Barcilla | FS-139 | `220078025` | 9/4 (row 9: BARCILLA, LAILA) |
| Charina Ordame | FS-136 | `202592988565I` | 9/4 (row 10: ORULANE, CHARINA) |
| Haide Abano | FS-142 | `202205305644I` | 9/4 (row 12: ABAÑO, HAIDE) |
| Ma. Clariss Aguillon | FS-135 | `202309489271I` | 9/4 (row 13: AGUILLON, MA. CLARIS) |
| Daniel Tomanda | FS-115 | `202205306402I` | 9/4 (row 18: TOMANDA, DANIEL) |
| Dulce Duzon | VS-63 | `202205304832I` | 9/4 (row 21: DUZON, DULCE) |
| Felisa Abas | FS-106 | `202205305429I` | 9/4 (row 26: ABAS, FELISA) |
| Eric Vertudez | FS-121 | `202592443093I` | 9/4 (row 27: VERTUDEZ, ERIK) |
| Martha Lonzaga | CS-47 | `220077568` | 9/4 (row 28: LONSAGA) |
| Mary Ann Almaden | MS-52 | `20220530699I` | 9/4 (row 38: ALMADEN, MARY ANN) |
| Ronalyn Bigoy | MS-55, MS-56 | `25012123184I` | 9/4 (row 42: BIGOY, RONAYLN) |
| Celeste Banez (P) | CS-49 | `2536291I` | 9/4 (row 46: BAÑEZ) |
| Gerry Lipayon | MS-61 | `220077575` | 9/4 (row 48: LIPAYON, GERRY) |
| Leo Lanza | MS-53, MS-54 | `202205306395I` | 9/4 (row 49: LANZA, LEO) |
| Magdua Genevieve | VS-91 | `202309489263I` | 9/4 (row 50: MAGDUA, Genevieve) |
| Baby J Arcena | CS-37, CS-38 | `2411110520` | 9/4 (row 57: ARCENA, BABAY JANE) |
| Jetro Villero | CS-32, CS-33 | `2509062516` | 9/4 (row 58: VILLERO, JETRO) |
| Gasing Nestor | VS-94 | `25058830` | 9/9 (row 14: GASING) |
| Lamoste Rey | VS-194 | `202205306394I` | 9/9 (row 16: LAMOSTE, REY) |
| Camposano Lisa | VS-13 | `25462191` | 9/9 (row 17: CAMPOSANO, LISA) |
| Nerja Nerly | VS-203 | `202209373605I` | 9/9 (row 20: NERJA, NERLY) |
| Yepes Oscar | VS-197 | `202205304697I` | 9/9 (row 25: YEPEZ, OSCAR) |
| Camino Cheenee | VS-191 | `202492369678I` | 9/9 (row 26: CAMINO, CHENE) |
| Anos Diane | VS-88 | `202309489229I` | 9/9 (row 27: ANOS, DIANE) |
| Sheryl Zialcita | VS-169 | `2546195I` | 9/9 (row 28: ZIALCITA, HERYL) |
| Jaime Oringo | MS-57, MS-58 | `220077579` | 9/11 (row 8: ORINGCO, JAIME) |
| Martha Lonzaga | CS-47 | `202309490140I` | 9/11 (row 11: LONZAGA, MANUEL / Martha) |
| Albao Darwin | VS-162 | `202592449623I` | 9/11 (row 13: ALBAO, DARWIN) |
| Joel Arellano | KS-77 | `202205304683I` | 9/11 (row 21: ARELLANO, JOEL) |
| Lancaran Isabelita | DS-171 | `2490489I` | 9/11 (row 22: LANCARAN, ISABELITA) |
| Jacquiline Flores | KS-80 | `202304076462` | 9/11 (row 30: FLORES, JACKQUILINE) |
| Dulce Duzon | VS-63 | `WJF095902026` | 9/11 (row 37: DUZON, DULCE) |
| Ronalyn Bigoy | MS-55, MS-56 | `587798` | 9/15 (row 4: BIGOY, RONALYN) |
| Alwin Magdua | CS-29 | `202205305669I` | 9/15 (row 18: MAGDUA, ALWIN) |
| Gasing Nestor | VS-94 | `25305353` | 9/16 (row 4: GASING, NESTOR) |
| Eileen Dapitan | CS-39, CS-40 | `370037` | 9/16 (row 11: DAPITAN, ELAINE) |
| Jaime Oringo | MS-57, MS-58 | `587454` | 9/17 (row 7: ORINGO, JAIME) |
| Jacquiline Flores | KS-80 | `2602838I` | 9/17 (row 10: FLORES, JACQUILINE) |
| Percival Cervantes | CS-30 | `202392186027I` | 9/17 (row 11: CERVANTES, JOSE) |
| Romeo Lipayon | MS-15 | `220078024` | 9/17 (row 12: LIPAYON, ROMEO) |

## Rows that match no one in the directory

Kept in the system so the meter can still be looked up. Name the right tenant on the tenant record, and the meter goes with it.

| Sheet of | Row | Name on the sheet | Meter serial | Brand | Note |
| --- | --- | --- | --- | --- | --- |
| 8/27 | 1 | PEPITO, ROSELYN | `587077` | CLADEN |  |
| 8/27 | 2 | REDOÑA, HEGINO | `587074` | CLADEN | Same surname as Narcisa Redona (KS-2), who has her own meter |
| 8/27 | 11 | LEGASPI, CYD | `PS2602847I` | PROSEAL |  |
| 9/4 | 1 | AGUILAR, JOEL | `202205305665J` | SAFARI |  |
| 9/4 | 2 | TAYAN, Ariel | `23040186524` | IZUKI |  |
| 9/4 | 3 | AGUILLAR, JOVIE | `202205305871I` | SAFARI |  |
| 9/4 | 4 | RONSAGA, MICHELLE | `2105274313I` | SAFARI |  |
| 9/4 | 8 | AVILA, DAISY | `23040186513` | IZUKI |  |
| 9/4 | 14 | PALABIO, ELIZABETH | `202309489281I` | SAFARI |  |
| 9/4 | 16 | AGUILAR, GLEN | `23030181373` | IZUKI |  |
| 9/4 | 22 | GRADATA, RICARDO | `20239477909I` | SAFARI | Possibly Ricardo Ordame (FS-148) |
| 9/4 | 23 | ORDATE, LENI | `202492390512I` | SAFARI | Possibly Rine Ordame (FS-149), who has 586853 from 9/11 |
| 9/4 | 29 | EMOYLAN, KEVIN | `220077578` | SAFARI | Possibly for Caroline Emoylan (MS-59, MS-60) |
| 9/4 | 32 | IMPORTA, SONNY | `202205305866I` | SAFARI |  |
| 9/4 | 33 | GATE 2, RODRIGO | `202205305863I` | SAFARI |  |
| 9/4 | 34 | MAGDUA / SHIERLEY | `202309490161I` | SAFARI | Possibly Ashley Magdua (CS-34) |
| 9/4 | 40 | BORREL, JOE | `2105190845I` | SAFARI | Possibly Fernando Borrel (MS-17) |
| 9/4 | 51 | CERVANTES, NEIL | `491236` | CLADEN |  |
| 9/4 | 52 | TAYANES, JENNIFER | `202209415510I` | TOSHIBA |  |
| 9/4 | 54 | PARADO, LEEMAR | `24012308263` | IZUKI | Possibly Leymar Loteyro (MS-19), who has OY020259630004I from 8/27 |
| 9/9 | 5 | RECOSSANA, ROMMEL | `2403129259` | SAFARI |  |
| 9/9 | 7 | BACO, OSCAR | `23040184896` | IZUKI |  |
| 9/9 | 13 | ALBA, EVANGELINE | `202209416337I` | SAFARI | Possibly Rellona Evangeline (VS-185) — the previous register has her as "RELLONA, EVANGELINE ALBA" |
| 9/11 | 10 | SACLAY, RUSTICO | `202205305419I` | SAFARI | Possibly for Saclay Julieta (FD-8, FD-70) |
| 9/11 | 12 | ALBAO, NICANORA | `2603780I` | PROSEAL |  |
| 9/11 | 14 | ESPADA, EVELYN | `202205305642I` | SAFARI |  |
| 9/11 | 18 | MERCADO, JOY | `2536280I` | PROSEAL |  |
| 9/11 | 20 | MACEDA, ELIZA / Pudol | `202205304685I` | SAFARI | "Pudol" written in: possibly Podol Ramil (VS-163), who has 587788 from 9/16 |
| 9/11 | 23 | ABAÑO, KIRBY | `26012870397I` | SAFARI |  |
| 9/11 | 28 | CREER, HERSHEY | `23040186522` | IZUKI |  |
| 9/11 | 29 | MORANTE, ELSA | `23040186523` | IZUKI |  |
| 9/11 | 34 | AGUILAR, JOEL | `202303009723` | OPPO |  |
| 9/11 | 35 | PALABIO, FRANCISCO | `586849` | CLADEN |  |
| 9/15 | 3 | OLGUERA, MAR | `202492330343I` | SAFARI | "MAR" is crossed out on the 9/9 sheet in favour of Angelica, so a different Olguira from Angeila (VS-196) |
| 9/15 | 5 | CAPISTRANO, JIMMY | `25007361298` | IZUKI |  |
| 9/15 | 9 | RELLONA, ANGELA | `26006428657` | IZUKI | Possibly Rellona Evangeline (VS-185) |
| 9/15 | 17 | MAGDUA | `25362935` | PROSEAL | One of Alwin (CS-29), Ashley (CS-34), C Godwin (MS-51) or Genevieve (VS-91) Magdua |
| 9/16 | 8 | EMOYLAN, KEVIN JOSHUA | `587456` | CLADEN | Possibly for Caroline Emoylan (MS-59, MS-60) |
| 9/16 | 10 | REFALDA, RELLAN | `587451` | CLADEN |  |
| 9/16 | 12 | ESPADA, EVELYN | `26006428737` | IZUKI |  |
| 9/16 | 13 | ALBAO, NICANORA | `23132420` | SAFARI |  |
| 9/17 | 4 | ANGELICA | `587460` | CLADEN | Eileen (Elaine Angelica) Dapitan's second stall CS-40, or Olguira Angeila (VS-196) |
| 9/17 | 6 | EMOYLEN, KEVIN | `587445` | CLADEN | Possibly for Caroline Emoylan (MS-59, MS-60) |
| 9/17 | 8 | BIGOY, ANDO | `587458` | CLADEN | Possibly Regiie Bigoy (MS-26) or Ronalyn Bigoy (MS-55, MS-56) |
| 9/17 | 9 | MERCADO, JOY | `202035376` | SAFARI |  |
| 9/18 | 5 | JORDAN, KIM | `586858` | CLADEN |  |
| 9/18 | 6 | ALBAO, NICANORA | `587052` | CLADEN |  |
| 9/18 | 8 | MENDIOLA, LETECIA | `587243` | CLADEN |  |
| 9/18 | 9 | MERCADO, JOY | `587448` | CLADEN |  |
| 9/21 | 1 | EMPUERTA, SONNY | `202592981407` | SAFARI |  |
| 9/29 | 1 | BETASOLO, GENEVIEVE | `22002485` | SAFARI |  |

Not loaded: two other documents were among the photographs — the cooperative's "Summary of Consumers Subject for Relocation Due to Construction of New Market Building" (account numbers and meters of the old connections, most of them disconnected), and a list of ten meters dated 11/8/2026 with passed/defective remarks. Neither is a calibration sheet, so their numbers are not used.

