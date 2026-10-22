# Bilag: startkatalog over behandlinger

Bilag til `docs/architecture.md` 4.3 (`service_groups`, `services`). Listen er grundlaget for migrationen `20261014000100_service_groups.sql` (arbejdsplan 1.9), som er kørt. Kataloget vedligeholdes nu i databasen (admin/service role), ikke i kode og ikke i dette bilag; bilaget viser startindholdet og opdateres ikke.

Regler:
- Slugs er stabile nøgler (`^[a-z0-9_]{2,60}$`). De 14 eksisterende ydelser beholder deres slug og deres `category`; de får kun en kategori (`group_id`), nyt `sort_order` og evt. et justeret navn eller beskrivelse.
- `category` (`general` / `cosmetic` / `emergency`) er den overordnede type, som akutlogik og filtre bruger. Alle ydelser i kategorien `akut` har `category = 'emergency'`, og ingen andre har det.
- Beskrivelserne er neutrale forklaringer af, hvad behandlingen er: ingen priser, ingen vurderinger, ingen løfter om resultat (AI'en må bruge dem, 7.3).
- Varighed i minutter er `default_duration_min`; klinikken kan sætte sin egen.
- `sort_order` på kategorier: 10, 20, 30 … i den viste rækkefølge. På ydelser: kategoriens tal × 10 + 1, 2, 3 … (fx 101, 102 …), så der er plads til nye.

Markering: **(findes)** = eksisterende slug fra `20261012000200_services_catalog.sql`.

## Kategorier (`service_groups`)

| # | slug | Navn | Beskrivelse |
|---|---|---|---|
| 1 | `forebyggelse` | Undersøgelse og forebyggelse | Almindelige eftersyn, rensning og behandlinger, der forebygger problemer. |
| 2 | `fyldninger` | Fyldninger og reparationer | Behandling af huller og reparation af beskadigede tænder. |
| 3 | `rodbehandlinger` | Rodbehandling | Behandling inde i tanden, når nerven er påvirket. |
| 4 | `kroner_broer` | Kroner og broer | Faste erstatninger og overdækninger af tænder. |
| 5 | `implantater` | Implantater | Erstatning af manglende tænder med en skrue i kæbeknoglen. |
| 6 | `proteser` | Proteser | Aftagelige erstatninger for manglende tænder. |
| 7 | `tandkoed` | Tandkød og paradentose | Undersøgelse og behandling af tandkød og tandkødslommer. |
| 8 | `kirurgi` | Kirurgi og tandudtrækning | Fjernelse af tænder og mindre kirurgiske indgreb i munden. |
| 9 | `tandregulering` | Tandregulering | Flytning af tænder med bøjle eller skinner og fastholdelse bagefter. |
| 10 | `kosmetisk` | Kosmetisk tandbehandling | Behandlinger, der ændrer tændernes farve, form eller udseende. |
| 11 | `boern_unge` | Børn og unge | Tandbehandling tilpasset børn og unge. |
| 12 | `bidskinner` | Bidskinner og tænderskæren | Behandling ved tænderskæren, ømme kæber og problemer med bidet. |
| 13 | `tandlaegeangst` | Tandlægeskræk og bedøvelse | Ekstra tid og hjælp til patienter, der er nervøse for tandlægebesøg. |
| 14 | `akut` | Akut tandpleje | Hurtig hjælp ved smerter, skader og andre akutte problemer. |

## Behandlinger (`services`)

### 1 `forebyggelse` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `undersoegelse` (findes) | Undersøgelse | Tandlægen kigger på tænder og tandkød og taler med dig om dine ønsker og spørgsmål. | 30 |
| `tandrensning` (findes) | Tandrensning | Fjernelse af belægninger og tandsten af tandlæge eller tandplejer. | 45 |
| `roentgen` (findes) | Røntgenbilleder | Billeder af tænder og kæbe, som tandlægen bruger i sin undersøgelse. | 15 |
| `fluorbehandling` | Fluorbehandling | Påføring af fluor på tænderne for at styrke emaljen. | 15 |
| `fissurforsegling` | Fissurforsegling | En tynd belægning i furerne på kindtænderne, så belægninger har sværere ved at sætte sig. | 30 |

### 2 `fyldninger` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `fyldning` (findes) | Fyldning | Tandlægen fylder et hul i en tand med fyldningsmateriale. | 45 |
| `stor_fyldning` | Større fyldning | En fyldning, der dækker en større del af tanden eller flere flader. | 60 |
| `udskiftning_fyldning` | Udskiftning af fyldning | En ældre fyldning fjernes og erstattes af en ny. | 45 |
| `reparation_knaekket_tand` | Reparation af knækket tand | En afslået eller knækket tand bygges op igen med fyldningsmateriale. | 45 |

### 3 `rodbehandlinger` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `rodbehandling` (findes) | Rodbehandling | Behandling inde i en tand, hvor nerven er påvirket. | 90 |
| `rodbehandling_kindtand` | Rodbehandling af kindtand | Rodbehandling af en tand bagerst i munden, som har flere rodkanaler. | 120 |
| `rodbehandling_genbehandling` | Genbehandling af rodfyldning | En tidligere rodbehandling åbnes og behandles igen. | 120 |
| `opbygning_efter_rodbehandling` | Opbygning efter rodbehandling | Tanden bygges op igen, efter at rodbehandlingen er afsluttet. | 60 |

### 4 `kroner_broer` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `krone` (findes) | Krone | En tilpasset overdækning, der sættes på en tand. | 60 |
| `bro` | Bro | En fast erstatning for en eller flere manglende tænder, som sidder fast på nabotænderne. | 90 |
| `indlaeg` | Indlæg (inlay/onlay) | Et tilpasset fyldningsstykke, der fremstilles uden for munden og sættes fast i tanden. | 60 |
| `midlertidig_krone` | Midlertidig krone | En krone, der beskytter tanden, mens den endelige krone bliver fremstillet. | 30 |

### 5 `implantater` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `implantat_samtale` | Samtale om implantat | En samtale om muligheder og forløb ved et tandimplantat. | 45 |
| `implantat` | Tandimplantat | En skrue sættes i kæbeknoglen som rod for en ny tand. | 120 |
| `krone_paa_implantat` | Krone på implantat | En krone, der sættes fast på et implantat. | 60 |
| `knogleopbygning` | Knogleopbygning | Kæbeknoglen bygges op, så der er plads til et implantat. | 90 |

### 6 `proteser` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `helprotese` | Helprotese | En aftagelig protese, der erstatter alle tænder i over- eller underkæben. | 60 |
| `delprotese` | Delprotese | En aftagelig protese, der erstatter nogle af tænderne. | 60 |
| `protese_tilpasning` | Tilpasning af protese | En eksisterende protese justeres, så den sidder bedre. | 30 |
| `protese_reparation` | Reparation af protese | En knækket eller beskadiget protese repareres. | 30 |

### 7 `tandkoed` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `tandkoedsundersoegelse` | Undersøgelse af tandkød | Tandlægen måler tandkødslommerne og kigger på tandkødet. | 45 |
| `dybderensning` | Dybderensning | Rensning af tandkødslommer under tandkødskanten. | 60 |
| `tandkoed_opfoelgning` | Opfølgende tandkødsbehandling | Regelmæssig rensning og kontrol efter en tandkødsbehandling. | 45 |

### 8 `kirurgi` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `tandudtraekning` (findes) | Tandudtrækning | Tandlægen fjerner en tand. | 45 |
| `visdomstand` | Fjernelse af visdomstand | En visdomstand fjernes. | 60 |
| `kirurgisk_udtraekning` | Kirurgisk tandudtrækning | En tand fjernes ved et mindre kirurgisk indgreb, fx hvis den sidder fast. | 75 |
| `tandkoedskorrektion` | Korrektion af tandkød | Tandkødets form eller højde justeres ved et mindre indgreb. | 60 |

### 9 `tandregulering` (cosmetic)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `tandregulering_konsultation` (findes) | Samtale om tandregulering | En samtale om muligheder for at flytte tænder. | 45 |
| `fast_bojle` | Fast bøjle | En bøjle, der sidder fast på tænderne og flytter dem gradvist. | 60 |
| `tandreguleringsskinner` | Tandregulering med skinner | Gennemsigtige, aftagelige skinner, der flytter tænderne gradvist. | 45 |
| `retainer` (findes) | Retainer | En fast eller aftagelig tråd eller skinne, der holder tænderne på plads efter tandregulering. | 30 |

### 10 `kosmetisk` (cosmetic)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `blegning` (findes) | Blegning | Behandling, der gør tænderne lysere. | 60 |
| `facing` (findes) | Facing | Tynde skaller, der sættes på forsiden af tænderne for at ændre deres udseende. | 90 |
| `diastema` (findes) | Lukning af mellemrum mellem fortænder | Behandling, hvor et mellemrum mellem to tænder lukkes. | 60 |
| `kosmetisk_opbygning` | Kosmetisk opbygning af tand | Tandens form ændres med tandfarvet materiale. | 60 |

### 11 `boern_unge` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `boerneundersoegelse` | Undersøgelse af børn | Et eftersyn af et barns tænder i et tempo, der passer til barnet. | 30 |
| `fyldning_maelketand` | Fyldning i mælketand | Et hul i en mælketand fyldes. | 30 |
| `tilvaenning_tandlaege` | Tilvænning til tandlægebesøg | Korte besøg, hvor barnet lærer klinikken og behandlingen at kende. | 30 |

### 12 `bidskinner` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `bid_undersoegelse` | Undersøgelse af bid og kæbeled | Tandlægen undersøger bidet, kæbeleddet og tyggemusklerne. | 45 |
| `bidskinne` | Bidskinne | En tilpasset skinne, der bæres om natten og beskytter tænderne mod slid. | 45 |
| `bidskinne_justering` | Justering af bidskinne | En eksisterende bidskinne tilpasses. | 20 |

### 13 `tandlaegeangst` (general)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `angst_samtale` | Samtale om tandlægeskræk | En rolig samtale om, hvad der gør besøget svært, og hvordan behandlingen kan tilrettelægges. | 30 |
| `behandling_ekstra_tid` | Behandling med ekstra tid | En behandling med længere tid og pauser efter behov. | 60 |
| `beroligende_medicin` | Beroligende medicin | Behandling, hvor tandlægen bruger beroligende medicin som hjælp. | 60 |

### 14 `akut` (emergency)
| slug | Navn | Beskrivelse | Min. |
|---|---|---|---|
| `akut_konsultation` (findes) | Akut konsultation | En hurtig tid hos tandlægen, når der er brug for hjælp med det samme. | 30 |
| `akut_smertebehandling` (findes) | Akut hjælp ved smerter | En akut tid, hvor tandlægen tager sig af smerter. | 45 |
| `akut_knaekket_tand` | Akut hjælp ved knækket tand | En akut tid, når en tand er knækket eller slået løs. | 45 |
| `akut_haevelse` | Akut hjælp ved hævelse | En akut tid ved hævelse i mund, kind eller kæbe. | 45 |

I alt 14 kategorier og 53 behandlinger: de 14 eksisterende og 39 nye.
