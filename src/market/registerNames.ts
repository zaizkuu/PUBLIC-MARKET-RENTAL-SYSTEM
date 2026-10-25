/* ============================================================
   Tenant names as the register writes them
   ============================================================

   The market office's register lists a tenant as SURNAME, GIVEN NAMES in
   capitals — "LOTEYRO, LEEMAR", "SALVE, NIDA MONTE". The Market Stall
   Directory does not: it writes some names given name first ("Narcisa
   Redona") and others surname first ("Operio Jenefer"), so the surname cannot
   be found by position. Each directory name is therefore set out here by
   hand. Where the electric cooperative's calibration sheets name the person —
   they write SURNAME, GIVEN — the surname is taken from them; the rest are
   read from the given names. Only the order and the capitals change: the
   spelling stays the directory's (tests/register-names.test.mjs checks that
   every entry holds exactly the words of its directory name).

   Three could be read either way and are worth confirming with the office:
   Catan Rosario, Boco Ria and Ponferada Victoriano are taken as surname first,
   like the rest of their section.

   A name typed in later keeps its comma if it has one; without one, its last
   word — with a "Dela" or "De los" before it, and leaving a "Jr." or "III" at
   the end — is taken as the surname.

   Plain TypeScript with no imports, so the Node test runner loads it as-is.
   ============================================================ */

export const REGISTER_NAMES: Record<string, string> = {
  // Kakanin
  'Norida Lerios': 'LERIOS, NORIDA',
  'Narcisa Redona': 'REDONA, NARCISA',
  'Mary Joy Aguillon': 'AGUILLON, MARY JOY',
  'Jade Modesto': 'MODESTO, JADE',
  'Rosario Elardo': 'ELARDO, ROSARIO',
  'Joel Arellano': 'ARELLANO, JOEL',
  'Marthy Medrano': 'MEDRANO, MARTHY',
  'Catherine Flores': 'FLORES, CATHERINE',
  'Jacquiline Flores': 'FLORES, JACQUILINE',
  'Rhodora Cesar': 'CESAR, RHODORA',
  // Dried Fish/Eggs
  'Operio Jenefer': 'OPERIO, JENEFER',
  'Caimoy Genevieve': 'CAIMOY, GENEVIEVE',
  'Lancaran Isabelita': 'LANCARAN, ISABELITA',
  'Florita Soriano': 'SORIANO, FLORITA',
  'Julife Esjaban': 'ESJABAN, JULIFE',
  'Ervin Peralta': 'PERALTA, ERVIN',
  'Joy Dadizon': 'DADIZON, JOY',
  // Fruits/Duma
  'Cinco Jacquiline': 'CINCO, JACQUILINE',
  'Saclay Julieta': 'SACLAY, JULIETA',
  'Ladan Mae Merlyn': 'LADAN, MAE MERLYN',
  'Cinco Jocelyn': 'CINCO, JOCELYN',
  'Ponferada Victoriano': 'PONFERADA, VICTORIANO',
  // Vegetable
  'Duquilla Irene': 'DUQUILLA, IRENE',
  'Basihan Josephine': 'BASIHAN, JOSEPHINE',
  'Camposano Lisa': 'CAMPOSANO, LISA',
  'Marabut Myra': 'MARABUT, MYRA',
  'Dulce Duzon': 'DUZON, DULCE',
  'Vertudes Kate': 'VERTUDES, KATE',
  'Anos Diane': 'ANOS, DIANE',
  'Martos Sylvia': 'MARTOS, SYLVIA',
  'Pelino Florentina': 'PELINO, FLORENTINA',
  'Magdua Genevieve': 'MAGDUA, GENEVIEVE',
  'Guardaya Ma. Lourcel': 'GUARDAYA, MA. LOURCEL',
  'Telemban Esmeralda': 'TELEMBAN, ESMERALDA',
  'Gasing Nestor': 'GASING, NESTOR',
  'Villero Crisanta': 'VILLERO, CRISANTA',
  'Modesto Jade': 'MODESTO, JADE',
  'Villero Ester': 'VILLERO, ESTER',
  'Albao Darwin': 'ALBAO, DARWIN',
  'Podol Ramil': 'PODOL, RAMIL',
  'Udtohan Neil': 'UDTOHAN, NEIL',
  'Vilma Garcia': 'GARCIA, VILMA',
  'Paranas Lyn': 'PARANAS, LYN',
  'Tolibas Roslyn': 'TOLIBAS, ROSLYN',
  'Lagarto Mary Jean': 'LAGARTO, MARY JEAN',
  'Sheryl Zialcita': 'ZIALCITA, SHERYL',
  'Salcedo Sofia Mae': 'SALCEDO, SOFIA MAE',
  'Salcedo Shaine Marie': 'SALCEDO, SHAINE MARIE',
  'Garcia Roberto III': 'GARCIA, ROBERTO III',
  'Rellona Evangeline': 'RELLONA, EVANGELINE',
  'Blase Maricel': 'BLASE, MARICEL',
  'Amistoso Jonathan': 'AMISTOSO, JONATHAN',
  'Dumalaoron Estelita': 'DUMALAORON, ESTELITA',
  'Royeras Francisco': 'ROYERAS, FRANCISCO',
  'Camino Cheenee': 'CAMINO, CHEENEE',
  'Marabut Mylene': 'MARABUT, MYLENE',
  'Menaya Roy': 'MENAYA, ROY',
  'Lamoste Rey': 'LAMOSTE, REY',
  'Karen G Villegas': 'VILLEGAS, KAREN G',
  'Olguira Angeila Ca Mae': 'OLGUIRA, ANGEILA CA MAE',
  'Yepes Oscar': 'YEPES, OSCAR',
  'Cordero Ma. Nilda': 'CORDERO, MA. NILDA',
  'Solano Wilson': 'SOLANO, WILSON',
  'Boco Ria': 'BOCO, RIA',
  'Dangco Jamel Rose': 'DANGCO, JAMEL ROSE',
  'Catan Rosario': 'CATAN, ROSARIO',
  'Nerja Nerly': 'NERJA, NERLY',
  'Madelyn Canayon': 'CANAYON, MADELYN',
  'Estember Cheremae': 'ESTEMBER, CHEREMAE',
  // Fish
  'Gloria Aguilar': 'AGUILAR, GLORIA',
  'Felisa Abas': 'ABAS, FELISA',
  'Joey Abando': 'ABANDO, JOEY',
  'Marilyn Candela': 'CANDELA, MARILYN',
  'Melvin Flores': 'FLORES, MELVIN',
  'Renalyn Melo': 'MELO, RENALYN',
  'Melba Melo': 'MELO, MELBA',
  'Abelardo Pardales': 'PARDALES, ABELARDO',
  'Merly Baguisa': 'BAGUISA, MERLY',
  'Colita Baguisa': 'BAGUISA, COLITA',
  'Daniel Tomanda': 'TOMANDA, DANIEL',
  'Milo Duzon': 'DUZON, MILO',
  'Corazon Dela Cruz': 'DELA CRUZ, CORAZON',
  'Lyza Dela Cruz': 'DELA CRUZ, LYZA',
  'Mary Ann Salano': 'SALANO, MARY ANN',
  'Nilda Ubaldo': 'UBALDO, NILDA',
  'Eric Vertudez': 'VERTUDEZ, ERIC',
  'Regine Garcia': 'GARCIA, REGINE',
  'Janith Cinco': 'CINCO, JANITH',
  'Sandro Aguillon': 'AGUILLON, SANDRO',
  'Princess Plaba': 'PLABA, PRINCESS',
  'Ma. Clariss Aguillon': 'AGUILLON, MA. CLARISS',
  'Charina Ordame': 'ORDAME, CHARINA',
  'Danilo Abanag': 'ABANAG, DANILO',
  'Alma Abanag': 'ABANAG, ALMA',
  'Laila Barcilla': 'BARCILLA, LAILA',
  'Jovita Plaba': 'PLABA, JOVITA',
  'Dennis Abano': 'ABANO, DENNIS',
  'Haide Abano': 'ABANO, HAIDE',
  'John Drandreb Gerilla': 'GERILLA, JOHN DRANDREB',
  'Reshile Labrado': 'LABRADO, RESHILE',
  'Benecio Costimiano': 'COSTIMIANO, BENECIO',
  'Karen Laurente': 'LAURENTE, KAREN',
  'Ricardo Ordame': 'ORDAME, RICARDO',
  'Rine Ordame': 'ORDAME, RINE',
  // Meat - Chicken
  'Joy Almaden (P)': 'ALMADEN, JOY (P)',
  'Alwin Magdua': 'MAGDUA, ALWIN',
  'Percival Cervantes': 'CERVANTES, PERCIVAL',
  'Solidad Cervantes': 'CERVANTES, SOLIDAD',
  'Jetro Villero': 'VILLERO, JETRO',
  'Ashley Magdua': 'MAGDUA, ASHLEY',
  'Baby J Arcena': 'ARCENA, BABY J',
  'Eileen Dapitan': 'DAPITAN, EILEEN',
  'Marites Laurino': 'LAURINO, MARITES',
  'Eliza Tizon': 'TIZON, ELIZA',
  'Vilma Lanza': 'LANZA, VILMA',
  'Chritine Ripalda': 'RIPALDA, CHRITINE',
  'Martha Lonzaga': 'LONZAGA, MARTHA',
  'Jennifer Almaden (P)': 'ALMADEN, JENNIFER (P)',
  'Celeste Banez (P)': 'BANEZ, CELESTE (P)',
  // Meat - Carabeef/Beef & Pork
  'Romeo Lipayon': 'LIPAYON, ROMEO',
  'Lorena Lipayon': 'LIPAYON, LORENA',
  'Fernando Borrel': 'BORREL, FERNANDO',
  'Gemma Gamez': 'GAMEZ, GEMMA',
  'Leymar Loteyro': 'LOTEYRO, LEYMAR',
  'Nida Salve': 'SALVE, NIDA',
  'Fatima Gaven': 'GAVEN, FATIMA',
  'Desiderio Camero': 'CAMERO, DESIDERIO',
  'Regiie Bigoy': 'BIGOY, REGIIE',
  'Aiza Odtuhan': 'ODTUHAN, AIZA',
  'Jingjing Terado': 'TERADO, JINGJING',
  'C Godwin Magdua': 'MAGDUA, C GODWIN',
  'Mary Ann Almaden': 'ALMADEN, MARY ANN',
  'Leo Lanza': 'LANZA, LEO',
  'Ronalyn Bigoy': 'BIGOY, RONALYN',
  'Jaime Oringo': 'ORINGO, JAIME',
  'Caroline Emoylan': 'EMOYLAN, CAROLINE',
  'Gerry Lipayon': 'LIPAYON, GERRY',
  'Leodegario Gerilla': 'GERILLA, LEODEGARIO',
};

/* Words that belong to the surname that follows them: Dela Cruz, De los Reyes. */
const PARTICLES = new Set(['de', 'del', 'dela', 'della', 'delos', 'la', 'los', 'san', 'sta', 'sta.', 'sto', 'sto.', 'van', 'von']);
/* Words that stay at the end, after the given names. */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', '(p)']);

/**
 * A tenant's name as the register writes it: SURNAME, GIVEN NAMES, in
 * capitals. Directory names come from REGISTER_NAMES; anything else is worked
 * out from the name as typed.
 */
export function registerName(name: string): string {
  const typed = name.trim().replace(/\s+/g, ' ');
  if (!typed) return '';
  const known = REGISTER_NAMES[typed];
  if (known) return known;
  if (typed.includes(',')) return typed.toUpperCase();
  const words = typed.split(' ');
  const tail: string[] = [];
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1].toLowerCase())) tail.unshift(words.pop()!);
  if (words.length < 2) return [...words, ...tail].join(' ').toUpperCase();
  let at = words.length - 1;
  while (at > 1 && PARTICLES.has(words[at - 1].toLowerCase())) at -= 1;
  const surname = words.slice(at).join(' ');
  const given = [...words.slice(0, at), ...tail].join(' ');
  return `${surname}, ${given}`.toUpperCase();
}
