/* ============================================================
   Electric meter serial numbers
   ============================================================

   The Don Orestes Romualdez Electric Cooperative's "Calibration Test Result
   (1 Phase KWHM - New)" sheets for the market's stalls, August–September
   2026. The office holds the serial numbers on these sheets to be the final
   meter numbers, whatever a sheet's Findings column says, so the findings
   are not kept here.

   `CALIBRATION_ROWS` is every row as the sheet prints it: the name in the
   cooperative's spelling, the serial character for character (a trailing
   letter I or J is part of the serial, not a 1), and the brand.
   `ELECTRIC_METERS` then says which directory stall each serial belongs to.
   The sheets list people, not stalls, so where a vendor holds more than one
   stall the meters are given to the stalls in stall-number order, and where
   someone was calibrated twice the later sheet's meter replaces the earlier
   one. Rows that match nobody in the directory are kept in the register so a
   meter number can still be looked up; they are listed in
   docs/ELECTRIC-METERS.md.

   Plain TypeScript with no imports, so the Node test runner can load it as-is
   (see tests/meters.test.mjs).
   ============================================================ */

/** [date calibrated, row on that sheet, name as printed, serial, brand, note]. */
export type CalibrationRow = [string, number, string, string, string, string?];

/* Six serials on the 9/4 continuation page sit on a crease that runs down the
   serial column. Each was read from two photographs of the page; the digit
   under the crease is the likeliest reading and is worth checking on the
   meter itself. */
const CREASE = 'One digit lies on a crease in the photo; confirm on the meter';

export const CALIBRATION_ROWS: CalibrationRow[] = [
  // 27 August 2026
  ['2026-08-27', 1, 'PEPITO, ROSELYN', '587077', 'CLADEN'],
  ['2026-08-27', 2, 'REDOÑA, HEGINO', '587074', 'CLADEN'],
  ['2026-08-27', 3, 'CESAR, RHODORA', 'WJF095902025', 'VOSHTECH'],
  ['2026-08-27', 4, 'ELARDO, ROSARIO', 'WJF95902034', 'VOSHTECH'],
  ['2026-08-27', 5, 'MODESTO, BELEN / Jade', 'WJF95902029', 'VOSHTECH', 'Jade written in by hand'],
  ['2026-08-27', 6, 'DADIZON, JOY', 'LGT202593029276I', 'SAFARI'],
  ['2026-08-27', 7, 'LOTEYRO, LEE MAR', 'OY020259630004I', 'SAFARI'],
  ['2026-08-27', 8, 'MEDRANO, MARTHY', '972205', 'SAFARI'],
  ['2026-08-27', 9, 'VERTUDES, ERIC', '587316', 'CLADEN'],
  ['2026-08-27', 10, 'UDTOHAN, NEIL', 'WJF95902040', 'VOSHTECH'],
  ['2026-08-27', 11, 'LEGASPI, CYD', 'PS2602847I', 'PROSEAL'],
  // 1 September 2026
  ['2026-09-01', 1, 'GUARDAYA, LOURCEL', 'KW202309489208I', 'SAFARI'],
  // 4 September 2026
  ['2026-09-04', 1, 'AGUILAR, JOEL', '202205305665J', 'SAFARI'],
  ['2026-09-04', 2, 'TAYAN, Ariel', '23040186524', 'IZUKI', 'Ariel written in by hand'],
  ['2026-09-04', 3, 'AGUILLAR, JOVIE', '202205305871I', 'SAFARI'],
  ['2026-09-04', 4, 'RONSAGA, MICHELLE', '2105274313I', 'SAFARI'],
  ['2026-09-04', 5, 'CANDELA, MARILYN', '2536274I', 'PROSEAL'],
  ['2026-09-04', 6, 'PLABA, JOVITA', '202492390548I', 'SAFARI'],
  ['2026-09-04', 7, 'PLABA, PRINCESS', '202205305653I', 'SAFARI'],
  ['2026-09-04', 8, 'AVILA, DAISY', '23040186513', 'IZUKI'],
  ['2026-09-04', 9, 'BARCILLA, LAILA', '220078025', 'SAFARI'],
  ['2026-09-04', 10, 'ORULANE, CHARINA', '202592988565I', 'SAFARI'],
  ['2026-09-04', 11, 'CABRADO, RESHILE', '202205305422I', 'SAFARI'],
  ['2026-09-04', 12, 'ABAÑO, HAIDE', '202205305644I', 'SAFARI'],
  ['2026-09-04', 13, 'AGUILLON, MA. CLARIS', '202309489271I', 'SAFARI'],
  ['2026-09-04', 14, 'PALABIO, ELIZABETH', '202309489281I', 'SAFARI'],
  ['2026-09-04', 15, 'MELO, MELBA', '20220550562I', 'SAFARI'],
  ['2026-09-04', 16, 'AGUILAR, GLEN', '23030181373', 'IZUKI'],
  ['2026-09-04', 17, 'LAUTENTE, KAREN', '23040186514', 'IZUKI'],
  ['2026-09-04', 18, 'TOMANDA, DANIEL', '202205306402I', 'SAFARI'],
  ['2026-09-04', 19, 'AGUILAR, GLORIA', '23040186521', 'IZUKI'],
  ['2026-09-04', 20, 'DELA CRUZ, CORAZON', '20219528948I', 'SAFARI'],
  ['2026-09-04', 21, 'DUZON, DULCE', '202205304832I', 'SAFARI'],
  ['2026-09-04', 22, 'GRADATA, RICARDO', '20239477909I', 'SAFARI'],
  ['2026-09-04', 23, 'ORDATE, LENI', '202492390512I', 'SAFARI'],
  ['2026-09-04', 24, 'GARCIA, REGINE', '587758', 'CLADEN'],
  ['2026-09-04', 25, 'COSTIMIADO, BENECO', '20239477896I', 'SAFARI'],
  ['2026-09-04', 26, 'ABAS, FELISA', '202205305429I', 'SAFARI'],
  ['2026-09-04', 27, 'VERTUDEZ, ERIK', '202592443093I', 'SAFARI'],
  ['2026-09-04', 28, 'LONSAGA', '220077568', 'SAFARI'],
  ['2026-09-04', 29, 'EMOYLAN, KEVIN', '220077578', 'SAFARI'],
  ['2026-09-04', 30, 'RIPALDA', '220077512', 'SAFARI'],
  ['2026-09-04', 31, 'ESTEMBER, CHERIE', '202209387311I', 'SAFARI'],
  ['2026-09-04', 32, 'IMPORTA, SONNY', '202205305866I', 'SAFARI'],
  ['2026-09-04', 33, 'GATE 2, RODRIGO', '202205305863I', 'SAFARI'],
  ['2026-09-04', 34, 'MAGDUA / SHIERLEY', '202309490161I', 'SAFARI'],
  ['2026-09-04', 35, 'SALVE, NIDA', '202205304699I', 'SAFARI'],
  ['2026-09-04', 36, 'LANZA, VILMA', '202309490143I', 'SAFARI'],
  ['2026-09-04', 37, 'TIZON, E', '2105274298I', 'SAFARI'],
  ['2026-09-04', 38, 'ALMADEN, MARY ANN', '20220530699I', 'SAFARI'],
  ['2026-09-04', 39, 'VILLERO, ESTER', '202209386983I', 'SAFARI'],
  ['2026-09-04', 40, 'BORREL, JOE', '2105190845I', 'SAFARI'],
  ['2026-09-04', 41, 'CANAYON, M', '23040184898', 'IZUKI'],
  ['2026-09-04', 42, 'BIGOY, RONAYLN', '25012123184I', 'SAFARI'],
  ['2026-09-04', 43, 'PELENIO', '23040184897', 'IZUKI'],
  ['2026-09-04', 44, 'VILLERO, CRISANTE', '202209386981I', 'SAFARI'],
  ['2026-09-04', 45, 'MARTOS, SILVIA', '105274289I', 'SAFARI'],
  ['2026-09-04', 46, 'BAÑEZ', '2536291I', 'PROSEAL', CREASE],
  ['2026-09-04', 47, 'BAGUISA, COLITA', '205069930I', 'TOSHIBA'],
  ['2026-09-04', 48, 'LIPAYON, GERRY', '220077575', 'SAFARI'],
  ['2026-09-04', 49, 'LANZA, LEO', '202205306395I', 'SAFARI'],
  ['2026-09-04', 50, 'MAGDUA, Genevieve', '202309489263I', 'SAFARI', 'Genevieve written in by hand'],
  ['2026-09-04', 51, 'CERVANTES, NEIL', '491236', 'CLADEN', CREASE],
  ['2026-09-04', 52, 'TAYANES, JENNIFER', '202209415510I', 'TOSHIBA'],
  ['2026-09-04', 53, 'CANRINO, MARITES', '577353', 'CLADEN', CREASE],
  ['2026-09-04', 54, 'PARADO, LEEMAR', '24012308263', 'IZUKI'],
  ['2026-09-04', 55, 'ALMADEN, JOHNNIFER', '26015351', 'PROSEAL', CREASE],
  ['2026-09-04', 56, 'ESLABAN, JULIFE', '2023-030092202', 'OPPO', CREASE],
  ['2026-09-04', 57, 'ARCENA, BABAY JANE', '2411110520', 'SASSIN', CREASE],
  ['2026-09-04', 58, 'VILLERO, JETRO', '2509062516', 'SASSIN'],
  // 9 September 2026
  ['2026-09-09', 1, 'CINCO, JACQUILINE', '202205305666I', 'SAFARI'],
  ['2026-09-09', 2, 'TOLIBAS, ROSELYN', '202209387788I', 'SAFARI'],
  ['2026-09-09', 3, 'SOLANO, WILSON', '202209387779I', 'SAFARI'],
  ['2026-09-09', 4, 'CORDERO, NILDA', '202209387785I', 'SAFARI'],
  ['2026-09-09', 5, 'RECOSSANA, ROMMEL', '2403129259', 'SAFARI'],
  ['2026-09-09', 6, 'OLGISERA, Angelica', '202205304694I', 'SAFARI', 'MAR crossed out; Angelica written in by hand'],
  ['2026-09-09', 7, 'BACO, OSCAR', '23040184896', 'IZUKI'],
  ['2026-09-09', 8, 'CAIMOY, GENEVIEVE', '2304018490I', 'IZUKI'],
  ['2026-09-09', 9, 'MENAYA, ROY', '202205304684I', 'SAFARI'],
  ['2026-09-09', 10, 'OPERIO, JENEFER', '23040184265', 'IZUKI'],
  ['2026-09-09', 11, 'MARABOT, MYRA', '202209387294I', 'SAFARI'],
  ['2026-09-09', 12, 'DUMALAORON, ESTIELITA', '23040184899', 'IZUKI'],
  ['2026-09-09', 13, 'ALBA, EVANGELINE', '202209416337I', 'SAFARI'],
  ['2026-09-09', 14, 'GASING', '25058830', 'SAFARI'],
  ['2026-09-09', 15, 'AGUILLO, SANDRO', '105275182I', 'SAFARI'],
  ['2026-09-09', 16, 'LAMOSTE, REY', '202205306394I', 'SAFARI'],
  ['2026-09-09', 17, 'CAMPOSANO, LISA', '25462191', 'PROSEAL'],
  ['2026-09-09', 18, 'LADAN, FRUITS', '23040184267', 'IZUKI'],
  ['2026-09-09', 19, 'UBALDO, NILDA', '202392137208I', 'SAFARI'],
  ['2026-09-09', 20, 'NERJA, NERLY', '202209373605I', 'SAFARI'],
  ['2026-09-09', 21, 'AMISTOSO, JOANTHAN', '202209387792I', 'SAFARI'],
  ['2026-09-09', 22, 'PARAMAS, LYNN', '2022093873121I', 'SAFARI'],
  ['2026-09-09', 23, 'LADAN, FRUITS', '23040184264', 'IZUKI'],
  ['2026-09-09', 24, 'ROYERAS, FRANCISCO', '202205305864I', 'SAFARI'],
  ['2026-09-09', 25, 'YEPEZ, OSCAR', '202205304697I', 'SAFARI'],
  ['2026-09-09', 26, 'CAMINO, CHENE', '202492369678I', 'SAFARI'],
  ['2026-09-09', 27, 'ANOS, DIANE', '202309489229I', 'SAFARI'],
  ['2026-09-09', 28, 'ZIALCITA, HERYL', '2546195I', 'PROSEAL'],
  ['2026-09-09', 29, 'DOQUIILA, IRENE', '201703600004916', 'CHINT'],
  // 11 September 2026
  ['2026-09-11', 1, 'BARCILLA, LAILA', '586944', 'CLADEN'],
  ['2026-09-11', 2, 'ARCENA, BABY JEAN', '586957', 'CLADEN'],
  ['2026-09-11', 3, 'VERTUDES, ERIC', '586946', 'CLADEN'],
  ['2026-09-11', 4, 'ORDAME, CHARINA', '586960', 'CLADEN'],
  ['2026-09-11', 5, 'AGULLON, MA. CLARISS', '586942', 'CLADEN'],
  ['2026-09-11', 6, 'ABAS, FELISA', '2023-03009737', 'OPPO'],
  ['2026-09-11', 7, 'GARCIA, VELMA', '210527189I', 'SAFARI'],
  ['2026-09-11', 8, 'ORINGCO, JAIME', '220077579', 'SAFARI'],
  ['2026-09-11', 9, 'LAGARTO, MARY JEAN', '23080202423', 'IZUKI'],
  ['2026-09-11', 10, 'SACLAY, RUSTICO', '202205305419I', 'SAFARI'],
  ['2026-09-11', 11, 'LONZAGA, MANUEL / Martha', '202309490140I', 'SAFARI', 'Martha written in by hand'],
  ['2026-09-11', 12, 'ALBAO, NICANORA', '2603780I', 'PROSEAL'],
  ['2026-09-11', 13, 'ALBAO, DARWIN', '202592449623I', 'SAFARI'],
  ['2026-09-11', 14, 'ESPADA, EVELYN', '202205305642I', 'SAFARI'],
  ['2026-09-11', 15, 'BASIHAN, JOSEPHINE', '202209387775', 'SAFARI'],
  ['2026-09-11', 16, 'REDOÑA, NARCISA', '201919080858', 'SAFARI'],
  ['2026-09-11', 17, 'FLORES, CATHERINE', '202392137669I', 'SAFARI'],
  ['2026-09-11', 18, 'MERCADO, JOY', '2536280I', 'PROSEAL'],
  ['2026-09-11', 19, 'CINCO, JANITH', '210527309I', 'SAFARI'],
  ['2026-09-11', 20, 'MACEDA, ELIZA / Pudol', '202205304685I', 'SAFARI', 'Pudol written in by hand'],
  ['2026-09-11', 21, 'ARELLANO, JOEL', '202205304683I', 'SAFARI'],
  ['2026-09-11', 22, 'LANCARAN, ISABELITA', '2490489I', 'PROSEAL'],
  ['2026-09-11', 23, 'ABAÑO, KIRBY', '26012870397I', 'SAFARI'],
  ['2026-09-11', 24, 'BAQUISA, MERYL', '202303009730', 'OPPO'],
  ['2026-09-11', 25, 'TOMANDA, DANIEL', '202303009724', 'OPPO'],
  ['2026-09-11', 26, 'PERALTA, ERVIN', '202303009733', 'OPPO'],
  ['2026-09-11', 27, 'PARDALES, ABELARDO', '202303009734', 'OPPO'],
  ['2026-09-11', 28, 'CREER, HERSHEY', '23040186522', 'IZUKI'],
  ['2026-09-11', 29, 'MORANTE, ELSA', '23040186523', 'IZUKI'],
  ['2026-09-11', 30, 'FLORES, JACKQUILINE', '202304076462', 'SAFARI'],
  ['2026-09-11', 31, 'VERTUDEZ, KATE', '202209386991I', 'SAFARI'],
  ['2026-09-11', 32, 'TERRADO, JINGJING', '202592449629I', 'SAFARI'],
  ['2026-09-11', 33, 'ORDAME, RINE', '586853', 'CLADEN'],
  ['2026-09-11', 34, 'AGUILAR, JOEL', '202303009723', 'OPPO'],
  ['2026-09-11', 35, 'PALABIO, FRANCISCO', '586849', 'CLADEN'],
  ['2026-09-11', 36, 'PLABA, PRINCESS', '587741', 'CLADEN'],
  ['2026-09-11', 37, 'DUZON, DULCE', 'WJF095902026', 'VOSCHTECH'],
  ['2026-09-11', 38, 'CANDELA, MARELYN', '202303009738', 'OPPO'],
  // 15 September 2026
  ['2026-09-15', 1, 'ALMADEN, MARY ANN', '587796', 'CLADEN'],
  ['2026-09-15', 2, 'GERILLA, JOHN DRANREB', '586848', 'CLADEN'],
  ['2026-09-15', 3, 'OLGUERA, MAR', '202492330343I', 'SAFARI'],
  ['2026-09-15', 4, 'BIGOY, RONALYN', '587798', 'CLADEN'],
  ['2026-09-15', 5, 'CAPISTRANO, JIMMY', '25007361298', 'IZUKI', 'Same serial printed as Yepes, Oscar (row 7)'],
  ['2026-09-15', 6, 'CAMERO, DESIDERIO', '25008363698', 'IZUKI'],
  ['2026-09-15', 7, 'YEPES, OSCAR', '25007361298', 'IZUKI', 'Same serial printed as Capistrano, Jimmy (row 5); the seal number suggests 25007361299'],
  ['2026-09-15', 8, 'CAMINO, CHENEE', '25008364107', 'IZUKI'],
  ['2026-09-15', 9, 'RELLONA, ANGELA', '26006428657', 'IZUKI'],
  ['2026-09-15', 10, 'ABANAG, ALMA', '586854', 'CLADEN'],
  ['2026-09-15', 11, 'LAMOSTE, REY', '587792', 'CLADEN'],
  ['2026-09-15', 12, 'LANZA, LEO', '587794', 'CLADEN'],
  ['2026-09-15', 13, 'LIPAYON, GERRY', '587790', 'CLADEN'],
  ['2026-09-15', 14, 'BANEÑEZ, CELESTE', '587797', 'CLADEN'],
  ['2026-09-15', 15, 'VELLERO, JETRO', '5866952', 'CLADEN'],
  ['2026-09-15', 16, 'ABAÑO, DENNIS', '587781', 'CLADEN'],
  ['2026-09-15', 17, 'MAGDUA', '25362935', 'PROSEAL'],
  ['2026-09-15', 18, 'MAGDUA, ALWIN', '202205305669I', 'SAFARI'],
  ['2026-09-15', 19, 'CAMPOSANO, LISA', '2023-03009727', 'OPPO'],
  ['2026-09-15', 20, 'LONSAGA, MARTHA', '26006428740', 'IZUKI'],
  ['2026-09-15', 21, 'GEVEN, MA. FATIMA', '586856', 'CLADEN'],
  // 16 September 2026
  ['2026-09-16', 1, 'ANOS, DIANE', '26004418932', 'IZUKI'],
  ['2026-09-16', 2, 'ZIALCITA, SHERYL', '26004418938', 'IZUKI'],
  ['2026-09-16', 3, 'NERJA, NERLY', '25007361296', 'IZUKI'],
  ['2026-09-16', 4, 'GASING, NESTOR', '25305353', 'SAFARI'],
  ['2026-09-16', 5, 'VILLEGAS, KAREN', '202209386979I', 'SAFARI'],
  ['2026-09-16', 6, 'MAGDUA, GENEVIEVE', '587782', 'CLADEN'],
  ['2026-09-16', 7, 'ARELLANO, JOEL', '587789', 'CLADEN'],
  ['2026-09-16', 8, 'EMOYLAN, KEVIN JOSHUA', '587456', 'CLADEN'],
  ['2026-09-16', 9, 'PODOL, RAMIL', '587788', 'CLADEN'],
  ['2026-09-16', 10, 'REFALDA, RELLAN', '587451', 'CLADEN'],
  ['2026-09-16', 11, 'DAPITAN, ELAINE', '370037', 'CLADEN'],
  ['2026-09-16', 12, 'ESPADA, EVELYN', '26006428737', 'IZUKI'],
  ['2026-09-16', 13, 'ALBAO, NICANORA', '23132420', 'SAFARI'],
  // 17 September 2026
  ['2026-09-17', 1, 'MAGDUA, ALWIN', '5487457', 'CLADEN', 'Seven digits as printed; every other CLADEN serial has six'],
  ['2026-09-17', 2, 'MAGDUA, CHARLES', '587450', 'CLADEN'],
  ['2026-09-17', 3, 'DAPITAN, ELAINE', '587453', 'CLADEN'],
  ['2026-09-17', 4, 'ANGELICA', '587460', 'CLADEN'],
  ['2026-09-17', 5, 'BIGOY, RONALYN', '587455', 'CLADEN'],
  ['2026-09-17', 6, 'EMOYLEN, KEVIN', '587445', 'CLADEN'],
  ['2026-09-17', 7, 'ORINGO, JAIME', '587454', 'CLADEN'],
  ['2026-09-17', 8, 'BIGOY, ANDO', '587458', 'CLADEN'],
  ['2026-09-17', 9, 'MERCADO, JOY', '202035376', 'SAFARI'],
  ['2026-09-17', 10, 'FLORES, JACQUILINE', '2602838I', 'PROSEAL'],
  ['2026-09-17', 11, 'CERVANTES, JOSE', '202392186027I', 'SAFARI'],
  ['2026-09-17', 12, 'LIPAYON, ROMEO', '220078024', 'SAFARI'],
  // 18 September 2026
  ['2026-09-18', 1, 'ABAÑO, HAIDE', '587785', 'CLADEN'],
  ['2026-09-18', 2, 'PLABA, JOVITA', '587786', 'CLADEN'],
  ['2026-09-18', 3, 'ORINGO, JAIME', '25007361304', 'IZUKI', 'Same serial printed as Dadizon, Joy on 21 September'],
  ['2026-09-18', 4, 'ALBAO, DARWIN', 'KW2025929810961', 'SAFARI'],
  ['2026-09-18', 5, 'JORDAN, KIM', '586858', 'CLADEN'],
  ['2026-09-18', 6, 'ALBAO, NICANORA', '587052', 'CLADEN'],
  ['2026-09-18', 7, 'CERVANTES, JOSE', '19L030423511', 'IZUKI'],
  ['2026-09-18', 8, 'MENDIOLA, LETECIA', '587243', 'CLADEN'],
  ['2026-09-18', 9, 'MERCADO, JOY', '587448', 'CLADEN'],
  ['2026-09-18', 10, 'BIGOY, REGIE', '587449', 'CLADEN'],
  ['2026-09-18', 11, 'DUZON, DULCE', '587259', 'CLADEN'],
  ['2026-09-18', 12, 'GASING N', '587244', 'CLADEN'],
  ['2026-09-18', 13, 'FLORES, JACQUILINE', '587247', 'CLADEN'],
  ['2026-09-18', 14, 'LANCANAN, ISABELITA', '26006428650', 'IZUKI'],
  // 21 September 2026
  ['2026-09-21', 1, 'EMPUERTA, SONNY', '202592981407', 'SAFARI'],
  ['2026-09-21', 2, 'SALAÑO, JEFER JOHN', '26012B631591', 'SAFARI'],
  ['2026-09-21', 3, 'DADIZON, JOY', '25007361304', 'SAFARI', 'Same serial printed as Oringo, Jaime on 18 September'],
  // 24 September 2026
  ['2026-09-24', 1, 'ODTOHAN, AIZA', '532654', 'CLADEN'],
  ['2026-09-24', 2, 'LIPAYAN, ROMEO', '582655', 'CLADEN'],
  // 29 September 2026
  ['2026-09-29', 1, 'BETASOLO, GENEVIEVE', '22002485', 'SAFARI'],
];

/* ---------- Which directory vendor each row belongs to ----------

   Matched by hand, row by row, against the directory and against the full
   names the market's previous register held ("DAPITAN, ELAINE ANGELICA
   ALMERIA" is the directory's Eileen Dapitan; "CERVANTES, JOSE PERCIVAL" its
   Percival Cervantes; "MAGDUA, CHARLES GODWIN" its C Godwin Magdua). A row is
   only matched when the surname and the given name both agree, allowing for
   the cooperative's spelling, or when a handwritten note on the sheet or the
   directory says who it is (ORULANE, CHARINA is annotated "Ordame, Charina";
   the directory writes "Jefer John" over stall 119). Values are the vendor's
   name exactly as DIRECTORY_ROWS prints it. Rows left out are not anyone in
   the directory, or could be more than one person; docs/ELECTRIC-METERS.md
   lists them with the likeliest candidates. */
export const ROW_OWNERS: Record<string, string> = {
  '2026-08-27#3': 'Rhodora Cesar',
  '2026-08-27#4': 'Rosario Elardo',
  '2026-08-27#5': 'Jade Modesto',
  '2026-08-27#6': 'Joy Dadizon',
  '2026-08-27#7': 'Leymar Loteyro',
  '2026-08-27#8': 'Marthy Medrano',
  '2026-08-27#9': 'Eric Vertudez',
  '2026-08-27#10': 'Udtohan Neil',
  '2026-09-01#1': 'Guardaya Ma. Lourcel',
  '2026-09-04#5': 'Marilyn Candela',
  '2026-09-04#6': 'Jovita Plaba',
  '2026-09-04#7': 'Princess Plaba',
  '2026-09-04#9': 'Laila Barcilla',
  '2026-09-04#10': 'Charina Ordame',
  '2026-09-04#11': 'Reshile Labrado',
  '2026-09-04#12': 'Haide Abano',
  '2026-09-04#13': 'Ma. Clariss Aguillon',
  '2026-09-04#15': 'Melba Melo',
  '2026-09-04#17': 'Karen Laurente',
  '2026-09-04#18': 'Daniel Tomanda',
  '2026-09-04#19': 'Gloria Aguilar',
  '2026-09-04#20': 'Corazon Dela Cruz',
  '2026-09-04#21': 'Dulce Duzon',
  '2026-09-04#24': 'Regine Garcia',
  '2026-09-04#25': 'Benecio Costimiano',
  '2026-09-04#26': 'Felisa Abas',
  '2026-09-04#27': 'Eric Vertudez',
  '2026-09-04#28': 'Martha Lonzaga',
  '2026-09-04#30': 'Chritine Ripalda',
  '2026-09-04#31': 'Estember Cheremae',
  '2026-09-04#35': 'Nida Salve',
  '2026-09-04#36': 'Vilma Lanza',
  '2026-09-04#37': 'Eliza Tizon',
  '2026-09-04#38': 'Mary Ann Almaden',
  '2026-09-04#39': 'Villero Ester',
  '2026-09-04#41': 'Madelyn Canayon',
  '2026-09-04#42': 'Ronalyn Bigoy',
  '2026-09-04#43': 'Pelino Florentina',
  '2026-09-04#44': 'Villero Crisanta',
  '2026-09-04#45': 'Martos Sylvia',
  '2026-09-04#46': 'Celeste Banez (P)',
  '2026-09-04#47': 'Colita Baguisa',
  '2026-09-04#48': 'Gerry Lipayon',
  '2026-09-04#49': 'Leo Lanza',
  '2026-09-04#50': 'Magdua Genevieve',
  '2026-09-04#53': 'Marites Laurino',
  '2026-09-04#55': 'Jennifer Almaden (P)',
  '2026-09-04#56': 'Julife Esjaban',
  '2026-09-04#57': 'Baby J Arcena',
  '2026-09-04#58': 'Jetro Villero',
  '2026-09-09#1': 'Cinco Jacquiline',
  '2026-09-09#2': 'Tolibas Roslyn',
  '2026-09-09#3': 'Solano Wilson',
  '2026-09-09#4': 'Cordero Ma. Nilda',
  '2026-09-09#6': 'Olguira Angeila Ca Mae',
  '2026-09-09#8': 'Caimoy Genevieve',
  '2026-09-09#9': 'Menaya Roy',
  '2026-09-09#10': 'Operio Jenefer',
  '2026-09-09#11': 'Marabut Myra',
  '2026-09-09#12': 'Dumalaoron Estelita',
  '2026-09-09#14': 'Gasing Nestor',
  '2026-09-09#15': 'Sandro Aguillon',
  '2026-09-09#16': 'Lamoste Rey',
  '2026-09-09#17': 'Camposano Lisa',
  '2026-09-09#18': 'Ladan Mae Merlyn',
  '2026-09-09#19': 'Nilda Ubaldo',
  '2026-09-09#20': 'Nerja Nerly',
  '2026-09-09#21': 'Amistoso Jonathan',
  '2026-09-09#22': 'Paranas Lyn',
  '2026-09-09#23': 'Ladan Mae Merlyn',
  '2026-09-09#24': 'Royeras Francisco',
  '2026-09-09#25': 'Yepes Oscar',
  '2026-09-09#26': 'Camino Cheenee',
  '2026-09-09#27': 'Anos Diane',
  '2026-09-09#28': 'Sheryl Zialcita',
  '2026-09-09#29': 'Duquilla Irene',
  '2026-09-11#1': 'Laila Barcilla',
  '2026-09-11#2': 'Baby J Arcena',
  '2026-09-11#3': 'Eric Vertudez',
  '2026-09-11#4': 'Charina Ordame',
  '2026-09-11#5': 'Ma. Clariss Aguillon',
  '2026-09-11#6': 'Felisa Abas',
  '2026-09-11#7': 'Vilma Garcia',
  '2026-09-11#8': 'Jaime Oringo',
  '2026-09-11#9': 'Lagarto Mary Jean',
  '2026-09-11#11': 'Martha Lonzaga',
  '2026-09-11#13': 'Albao Darwin',
  '2026-09-11#15': 'Basihan Josephine',
  '2026-09-11#16': 'Narcisa Redona',
  '2026-09-11#17': 'Catherine Flores',
  '2026-09-11#19': 'Janith Cinco',
  '2026-09-11#21': 'Joel Arellano',
  '2026-09-11#22': 'Lancaran Isabelita',
  '2026-09-11#24': 'Merly Baguisa',
  '2026-09-11#25': 'Daniel Tomanda',
  '2026-09-11#26': 'Ervin Peralta',
  '2026-09-11#27': 'Abelardo Pardales',
  '2026-09-11#30': 'Jacquiline Flores',
  '2026-09-11#31': 'Vertudes Kate',
  '2026-09-11#32': 'Jingjing Terado',
  '2026-09-11#33': 'Rine Ordame',
  '2026-09-11#36': 'Princess Plaba',
  '2026-09-11#37': 'Dulce Duzon',
  '2026-09-11#38': 'Marilyn Candela',
  '2026-09-15#1': 'Mary Ann Almaden',
  '2026-09-15#2': 'John Drandreb Gerilla',
  '2026-09-15#4': 'Ronalyn Bigoy',
  '2026-09-15#6': 'Desiderio Camero',
  '2026-09-15#7': 'Yepes Oscar',
  '2026-09-15#8': 'Camino Cheenee',
  '2026-09-15#10': 'Alma Abanag',
  '2026-09-15#11': 'Lamoste Rey',
  '2026-09-15#12': 'Leo Lanza',
  '2026-09-15#13': 'Gerry Lipayon',
  '2026-09-15#14': 'Celeste Banez (P)',
  '2026-09-15#15': 'Jetro Villero',
  '2026-09-15#16': 'Dennis Abano',
  '2026-09-15#18': 'Alwin Magdua',
  '2026-09-15#19': 'Camposano Lisa',
  '2026-09-15#20': 'Martha Lonzaga',
  '2026-09-15#21': 'Fatima Gaven',
  '2026-09-16#1': 'Anos Diane',
  '2026-09-16#2': 'Sheryl Zialcita',
  '2026-09-16#3': 'Nerja Nerly',
  '2026-09-16#4': 'Gasing Nestor',
  '2026-09-16#5': 'Karen G Villegas',
  '2026-09-16#6': 'Magdua Genevieve',
  '2026-09-16#7': 'Joel Arellano',
  '2026-09-16#9': 'Podol Ramil',
  '2026-09-16#11': 'Eileen Dapitan',
  '2026-09-17#1': 'Alwin Magdua',
  '2026-09-17#2': 'C Godwin Magdua',
  '2026-09-17#3': 'Eileen Dapitan',
  '2026-09-17#5': 'Ronalyn Bigoy',
  '2026-09-17#7': 'Jaime Oringo',
  '2026-09-17#10': 'Jacquiline Flores',
  '2026-09-17#11': 'Percival Cervantes',
  '2026-09-17#12': 'Romeo Lipayon',
  '2026-09-18#1': 'Haide Abano',
  '2026-09-18#2': 'Jovita Plaba',
  '2026-09-18#3': 'Jaime Oringo',
  '2026-09-18#4': 'Albao Darwin',
  '2026-09-18#7': 'Percival Cervantes',
  '2026-09-18#10': 'Regiie Bigoy',
  '2026-09-18#11': 'Dulce Duzon',
  '2026-09-18#12': 'Gasing Nestor',
  '2026-09-18#13': 'Jacquiline Flores',
  '2026-09-18#14': 'Lancaran Isabelita',
  '2026-09-21#2': 'Mary Ann Salano',
  '2026-09-21#3': 'Joy Dadizon',
  '2026-09-24#1': 'Aiza Odtuhan',
  '2026-09-24#2': 'Romeo Lipayon',
};

export const rowKey = (row: CalibrationRow) => `${row[0]}#${row[1]}`;

/**
 * The electric meter on each directory stall. A vendor calibrated on more
 * than one date has the latest date's meters — a re-test replaced the meter
 * tested before it — and those go to the vendor's stalls in stall-number
 * order. A stall left over gets no meter: the sheets do not say which stall
 * a meter is on, so the office fills it in.
 *
 * `stalls` is the directory's tenancies, as [stall ID, vendor].
 */
export function electricMetersByStall(stalls: Array<[string, string]>): Map<string, CalibrationRow> {
  const latest = new Map<string, CalibrationRow[]>();
  for (const row of CALIBRATION_ROWS) {
    const vendor = ROW_OWNERS[rowKey(row)];
    if (!vendor) continue;
    const held = latest.get(vendor);
    if (!held || held[0][0] < row[0]) latest.set(vendor, [row]);
    else if (held[0][0] === row[0]) held.push(row);
  }
  const assigned = new Map<string, CalibrationRow>();
  latest.forEach((rows, vendor) => {
    const own = stalls.filter(([, name]) => name === vendor).map(([id]) => id);
    rows.forEach((row, i) => { if (own[i]) assigned.set(own[i], row); });
  });
  return assigned;
}

/** Every serial on the sheets, for looking a meter up by number or name. */
export function meterSuggestions(): Array<{ serial: string; label: string }> {
  return CALIBRATION_ROWS.map(([date, , name, serial, brand]) => ({
    serial,
    label: `${name} · ${brand} · calibrated ${date.slice(5).replace('-', '/')}`,
  }));
}
