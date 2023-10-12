// Implementation from pymavlink
// https://github.com/ArduPilot/pymavlink/blob/6b1e0c78d3cd6a53ea42d64e4a0f9d22aae1adf3/mavextra.py#L1216-L1219

const SAMPLING_RES = 10.0
const SAMPLING_MIN_LAT = -90.0
const SAMPLING_MAX_LAT = 90.0
const SAMPLING_MIN_LON = -180.0
const SAMPLING_MAX_LON = 180.0

const declination_table = [
[148.83402,138.83401,128.83401,118.83402,108.83402,98.83402,88.83402,78.83402,68.83402,58.83402,48.83402,38.83402,28.83402,18.83402,8.83402,-1.16598,-11.16598,-21.16598,-31.16598,-41.16598,-51.16598,-61.16598,-71.16598,-81.16598,-91.16598,-101.16598,-111.16598,-121.16598,-131.16598,-141.16598,-151.16598,-161.16598,-171.16598,178.83402,168.83402,158.83402,148.83402],
[129.09306,116.89412,105.78898,95.63017,86.23504,77.42476,69.04348,60.96591,53.09841,45.37592,37.75568,30.20867,22.70998,15.23027,7.73037,0.16098,-7.53238,-15.40109,-23.48496,-31.80703,-40.37375,-49.18062,-58.22152,-67.49946,-77.03640,-86.88079,-97.11212,-107.84156,-119.20626,-131.35191,-144.39481,-158.35719,-173.08769,171.78274,156.78187,142.43310,129.09306],
[85.81367,77.83602,71.40003,65.88433,60.88263,56.08204,51.22755,46.12774,40.67419,34.85457,28.74909,22.50583,16.29363,10.23812,4.36029,-1.45095,-7.40778,-13.74178,-20.61213,-28.04922,-35.95530,-44.15322,-52.45486,-60.71951,-68.88732,-76.99183,-85.16746,-93.67473,-102.97950,-113.96429,-128.46293,-150.36073,175.55488,138.00554,112.28051,96.48319,85.81367],
[48.22805,46.81921,45.24300,43.71189,42.27245,40.80022,39.00177,36.49549,32.95972,28.26545,22.54379,16.18846,9.77818,3.88971,-1.16066,-5.50500,-9.68832,-14.40052,-20.13990,-26.99385,-34.63319,-42.50584,-50.08478,-57.00760,-63.07978,-68.20773,-72.30336,-75.14845,-76.14220,-73.56875,-61.46573,-19.66028,28.39616,43.98783,48.35027,49.03265,48.22805],
[31.42931,31.60530,31.28145,30.79047,30.38024,30.16777,29.97487,29.25597,27.27948,23.46202,17.66378,10.37176,2.68673,-4.06559,-9.01317,-12.19989,-14.47861,-17.04830,-21.00672,-26.83158,-33.98769,-41.32654,-47.85214,-52.97945,-56.36644,-57.72068,-56.62201,-52.29959,-43.64045,-30.08348,-13.41611,2.35315,14.41455,22.53506,27.54777,30.28028,31.42931],
[22.67985,23.21169,23.25494,22.99742,22.63545,22.42369,22.46877,22.43187,21.42571,18.33186,12.46440,4.21692,-4.75068,-12.30560,-17.22721,-19.74039,-20.77499,-21.16946,-22.14607,-25.39336,-31.01102,-37.19196,-42.26227,-45.34969,-45.95366,-43.77299,-38.67388,-30.72261,-20.87969,-11.16390,-2.84711,4.17466,10.15622,15.07307,18.83144,21.33469,22.67985],
[17.07334,17.59062,17.77934,17.69577,17.34929,16.88674,16.56217,16.38656,15.63204,12.86517,6.93562,-1.75751,-10.98436,-18.20308,-22.41588,-24.27993,-24.67590,-23.50719,-21.00605,-19.72369,-21.87960,-26.21214,-30.23195,-32.25069,-31.49417,-28.07385,-22.58093,-15.67611,-8.73630,-3.38117,0.43868,3.90117,7.49078,10.92679,13.85484,15.93237,17.07334],
[13.37426,13.67217,13.78744,13.78998,13.54222,12.98780,12.38852,11.96065,11.09372,8.25499,2.21162,-6.34723,-14.82596,-20.89032,-23.89434,-24.45752,-23.26867,-20.14461,-15.21492,-10.62227,-9.09952,-11.18829,-14.91638,-17.58833,-17.75073,-15.65321,-12.03643,-7.38772,-2.92537,-0.15156,1.30857,3.04660,5.56513,8.30463,10.76538,12.51642,13.37426],
[11.10969,11.11944,11.01236,10.99728,10.84097,10.32286,9.70494,9.19687,8.09157,4.94277,-1.12864,-9.05484,-16.32980,-21.04376,-22.55109,-21.19496,-17.89373,-13.44411,-8.58084,-4.24867,-1.62827,-1.86509,-4.55045,-7.42469,-8.64775,-8.12536,-6.32716,-3.48850,-0.64489,0.72027,0.97976,1.90952,4.01623,6.51266,8.80749,10.44185,11.10969],
[9.88349,9.72040,9.41289,9.38439,9.33291,8.89921,8.31537,7.68011,6.17272,2.60695,-3.33977,-10.37899,-16.38823,-19.72660,-19.70115,-16.80477,-12.41185,-7.91607,-4.15177,-1.10381,1.22204,1.82879,0.23517,-2.13784,-3.62813,-3.94630,-3.34494,-1.85961,-0.22644,0.26762,-0.08803,0.44077,2.38763,4.89878,7.32401,9.15291,9.88349],
[9.12464,9.18177,8.94457,9.04553,9.19618,8.89744,8.21223,7.14260,4.96349,0.86055,-4.97931,-11.14357,-15.85640,-17.78532,-16.57645,-13.08478,-8.67898,-4.59243,-1.60427,0.55144,2.39028,3.23916,2.31654,0.46434,-0.91732,-1.53003,-1.62589,-1.18564,-0.62403,-0.86624,-1.66562,-1.50145,0.21812,2.79294,5.56329,7.91823,9.12464],
[8.06290,8.93172,9.29767,9.81684,10.30693,10.20311,9.30721,7.53634,4.41412,-0.45099,-6.41113,-11.85029,-15.25565,-15.88209,-13.96742,-10.49677,-6.46933,-2.75504,-0.08743,1.66921,3.12874,3.96903,3.45981,2.05876,0.88578,0.20951,-0.29117,-0.68669,-1.18101,-2.27487,-3.63054,-3.95562,-2.62221,-0.08793,3.01927,6.01454,8.06290],
[6.31041,8.41617,9.93058,11.21483,12.13996,12.23034,11.14011,8.66524,4.49928,-1.34733,-7.71989,-12.71272,-15.08305,-14.75641,-12.45343,-9.09705,-5.35725,-1.83470,0.82823,2.57001,3.86519,4.69588,4.60243,3.76104,2.87601,2.13967,1.24833,0.02788,-1.62859,-3.80231,-5.90990,-6.79346,-5.87079,-3.45535,-0.15720,3.34006,6.31041],
[4.26294,7.59975,10.43666,12.70491,14.16020,14.43398,13.18770,10.10768,4.90586,-2.08386,-9.15208,-14.09196,-15.93051,-15.08268,-12.51517,-9.09089,-5.35759,-1.77919,1.14514,3.24292,4.77489,5.90082,6.46683,6.42854,5.95440,5.04613,3.49019,1.14215,-1.96091,-5.46021,-8.43365,-9.79880,-9.13330,-6.77311,-3.34752,0.50970,4.26294],
[2.57464,6.81988,10.72127,13.95370,16.10049,16.72460,15.39548,11.64478,5.15172,-3.36781,-11.49173,-16.72206,-18.40831,-17.31430,-14.50140,-10.79977,-6.74992,-2.76545,0.78143,3.70100,6.08013,8.07892,9.67963,10.67456,10.77058,9.65347,7.07600,3.02043,-2.09809,-7.27683,-11.16806,-12.81861,-12.13043,-9.62141,-5.97603,-1.77704,2.57464],
[1.43503,6.27921,10.88019,14.88261,17.80063,19.02158,17.77297,13.12636,4.53718,-6.54055,-16.27050,-21.85552,-23.31365,-21.85455,-18.61101,-14.36797,-9.64057,-4.79964,-0.13239,4.18385,8.10605,11.64519,14.70734,16.97990,17.92977,16.88820,13.23164,6.81146,-1.34665,-8.97876,-14.01257,-15.81005,-14.85926,-12.00033,-7.99733,-3.40265,1.43502],
[0.13094,5.45479,10.54962,15.08235,18.55436,20.17754,18.67574,12.20150,-0.36226,-15.49225,-26.46004,-31.19380,-31.33251,-28.66356,-24.33699,-19.03627,-13.18344,-7.06335,-0.88475,5.19490,11.05071,16.55252,21.50321,25.56424,28.16988,28.41286,24.95220,16.43585,3.63861,-8.67079,-16.18909,-18.69045,-17.68753,-14.54612,-10.18137,-5.16795,0.13094],
[-4.14830,1.12345,5.96040,9.84415,11.94596,10.80871,4.02869,-10.36405,-27.94912,-39.79617,-44.16477,-43.57950,-40.12657,-34.99189,-28.83083,-22.02403,-14.80922,-7.34799,0.23881,7.85050,15.39197,22.75942,29.82156,36.38924,42.15868,46.59144,48.63821,46.09967,34.72041,12.13936,-8.98865,-18.65098,-20.47841,-18.40133,-14.39834,-9.45818,-4.14830],
[-169.79948,-159.79948,-149.79948,-139.79948,-129.79948,-119.79948,-109.79948,-99.79948,-89.79948,-79.79948,-69.79948,-59.79948,-49.79948,-39.79948,-29.79948,-19.79948,-9.79948,0.20052,10.20052,20.20052,30.20052,40.20052,50.20052,60.20052,70.20052,80.20052,90.20052,100.20052,110.20052,120.20052,130.20052,140.20052,150.20052,160.20052,170.20052,-179.79948,-169.79948]
]

const inclination_table = [
[-72.02070,-72.02071,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02070,-72.02071,-72.02070,-72.02071],
[-78.23208,-77.46612,-76.54604,-75.51344,-74.40408,-73.25043,-72.08420,-70.93779,-69.84384,-68.83332,-67.93241,-67.15960,-66.52407,-66.02648,-65.66205,-65.42519,-65.31392,-65.33255,-65.49161,-65.80511,-66.28626,-66.94289,-67.77395,-68.76776,-69.90201,-71.14489,-72.45664,-73.79090,-75.09549,-76.31306,-77.38240,-78.24183,-78.83644,-79.12876,-79.10879,-78.79618,-78.23208],
[-80.80007,-78.97830,-77.14756,-75.29021,-73.38193,-71.40769,-69.37743,-67.33857,-65.37896,-63.61481,-62.16302,-61.10460,-60.45316,-60.14557,-60.06470,-60.08698,-60.13217,-60.19219,-60.32958,-60.65151,-61.27183,-62.27481,-63.69257,-65.50302,-67.64474,-70.03800,-72.60073,-75.25455,-77.92173,-80.51496,-82.91263,-84.88736,-85.95658,-85.63251,-84.30522,-82.60297,-80.80007],
[-77.45516,-75.43606,-73.49604,-71.57699,-69.59653,-67.45749,-65.08505,-62.48902,-59.81600,-57.35291,-55.46368,-54.46054,-54.44855,-55.23685,-56.40404,-57.49090,-58.18917,-58.42457,-58.34278,-58.24952,-58.51231,-59.42525,-61.10217,-63.46936,-66.34503,-69.53469,-72.88656,-76.29320,-79.66218,-82.88130,-85.73520,-87.38955,-86.36194,-84.15583,-81.83294,-79.58616,-77.45517],
[-71.58214,-69.61565,-67.71488,-65.86479,-64.01505,-62.04510,-59.77482,-57.07400,-54.02405,-51.03212,-48.80491,-48.09823,-49.26412,-51.92460,-55.16562,-58.07793,-60.10267,-61.01513,-60.84749,-59.97822,-59.15799,-59.18575,-60.45940,-62.86069,-65.97595,-69.36736,-72.71868,-75.80268,-78.35851,-80.06262,-80.67983,-80.25871,-79.08901,-77.46953,-75.59576,-73.59787,-71.58215],
[-64.39807,-62.40221,-60.40960,-58.42549,-56.48151,-54.55795,-52.49863,-50.03954,-47.03044,-43.80319,-41.39118,-41.16169,-43.78688,-48.51954,-53.83971,-58.60413,-62.35170,-64.81766,-65.60605,-64.62579,-62.64650,-61.08659,-61.05364,-62.68316,-65.34905,-68.24163,-70.78236,-72.62117,-73.51797,-73.52965,-73.02048,-72.24528,-71.21594,-69.88980,-68.25886,-66.38361,-64.39807],
[-55.02826,-52.87120,-50.69073,-48.44731,-46.19513,-44.04849,-42.00465,-39.74123,-36.79801,-33.33110,-30.77621,-31.26765,-35.68330,-42.58861,-49.78570,-56.05256,-61.22645,-65.24992,-67.52021,-67.43115,-65.26549,-62.35447,-60.45735,-60.49007,-61.96843,-63.81210,-65.26064,-65.90429,-65.53604,-64.51130,-63.52424,-62.77292,-61.94296,-60.76846,-59.16172,-57.17787,-55.02826],
[-42.23934,-39.72248,-37.30606,-34.84704,-32.29950,-29.84715,-27.62882,-25.25073,-22.02346,-18.13398,-15.56621,-17.09131,-23.52381,-32.78684,-42.11183,-49.91489,-55.93881,-60.34177,-62.85919,-63.04596,-60.93631,-57.41244,-54.21948,-52.82417,-53.10885,-54.02972,-54.81946,-54.92826,-53.94911,-52.38029,-51.27875,-50.79557,-50.20937,-49.05107,-47.23568,-44.84941,-42.23934],
[-25.31616,-22.26353,-19.64432,-17.13765,-14.48794,-11.90452,-9.56551,-6.93532,-3.35246,0.62534,2.69744,0.20162,-7.49683,-18.49333,-29.80260,-38.99555,-45.22087,-48.81124,-50.28975,-49.88122,-47.49942,-43.57896,-39.80201,-37.81589,-37.58213,-38.12733,-38.79073,-38.91636,-37.84560,-36.15384,-35.28930,-35.35164,-35.11620,-33.90633,-31.71407,-28.67497,-25.31616],
[-5.22365,-1.68002,0.98130,3.28459,5.73141,8.13291,10.33797,12.92226,16.28019,19.52644,20.64919,17.75076,10.26968,-0.68527,-12.39654,-21.81573,-27.55757,-29.98547,-30.24089,-29.18412,-26.62224,-22.51726,-18.50023,-16.36665,-16.02599,-16.47452,-17.18522,-17.56335,-16.82114,-15.49276,-15.21405,-16.04947,-16.38744,-15.33409,-12.92178,-9.31548,-5.22365],
[14.65727,18.24457,20.73560,22.68750,24.74090,26.83478,28.82717,31.06453,33.64927,35.73650,35.91607,33.06931,26.82267,17.82545,8.14938,0.35249,-4.22224,-5.65846,-5.08244,-3.67265,-1.30171,2.36894,6.00997,7.96495,8.31670,8.01335,7.45026,6.96852,7.19717,7.76654,7.31456,5.77666,4.68883,5.07867,7.05547,10.50432,14.65727],
[31.00203,34.03206,36.22486,37.93041,39.71929,41.67672,43.64451,45.63057,47.51149,48.64179,48.13476,45.46014,40.64785,34.34474,27.90343,22.77471,19.78522,19.08118,19.96093,21.39191,23.28877,25.96005,28.61507,30.09860,30.42073,30.29938,30.04062,29.74069,29.65970,29.53545,28.53162,26.62276,24.91817,24.37385,25.31100,27.72542,31.00203],
[43.33608,45.45851,47.28808,48.92364,50.69187,52.68920,54.75852,56.70372,58.24993,58.87748,58.03709,55.61656,52.01961,47.93440,44.13769,41.24459,39.61639,39.39065,40.22833,41.47069,42.89022,44.59331,46.23881,47.24171,47.57154,47.63935,47.66249,47.62919,47.50096,47.00810,45.71114,43.68014,41.65440,40.38784,40.27252,41.37670,43.33608],
[53.10131,54.36161,55.82606,57.45873,59.32146,61.39014,63.50628,65.43734,66.85905,67.31408,66.44780,64.38450,61.68268,58.96721,56.68844,55.08044,54.25566,54.24982,54.89128,55.82780,56.83438,57.87845,58.85920,59.59271,60.06042,60.40887,60.71534,60.90716,60.81057,60.15911,58.74748,56.73559,54.64618,53.02448,52.20550,52.28132,53.10131],
[61.90363,62.59082,63.73000,65.25974,67.10373,69.13404,71.16923,72.97878,74.24745,74.58969,73.79370,72.08739,69.99806,68.01780,66.44167,65.38391,64.86230,64.84287,65.21557,65.80372,66.46017,67.12970,67.80720,68.49179,69.18909,69.89166,70.52514,70.92481,70.86509,70.14456,68.73300,66.86155,64.92449,63.29260,62.20331,61.74779,61.90363],
[70.57319,70.97549,71.81891,73.05700,74.60513,76.33503,78.07584,79.60158,80.60606,80.76720,79.99878,78.58008,76.92858,75.37566,74.11340,73.22087,72.70518,72.52979,72.62677,72.91213,73.31657,73.81370,74.42101,75.17239,76.07666,77.07532,78.01176,78.63384,78.66938,77.98598,76.70086,75.10445,73.50638,72.14451,71.16426,70.63412,70.57319],
[78.82351,79.06440,79.60559,80.41612,81.44382,82.60991,83.79747,84.82323,85.41014,85.29919,84.52961,83.39228,82.15604,80.99185,79.99787,79.22370,78.68527,78.37555,78.27394,78.35635,78.60546,79.01788,79.60326,80.37283,81.31875,82.38760,83.44917,84.26774,84.54142,84.12292,83.18704,82.03917,80.91872,79.97342,79.28584,78.89722,78.82351],
[85.92404,85.99807,86.21370,86.55320,86.98729,87.46743,87.90712,88.15645,88.05609,87.61718,86.98684,86.28678,85.58976,84.94098,84.37090,83.90045,83.54357,83.30879,83.20077,83.22179,83.37274,83.65354,84.06234,84.59369,85.23581,85.96691,86.74942,87.51716,88.14109,88.39226,88.15089,87.63861,87.08412,86.59723,86.22810,86.00055,85.92404],
[88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420,88.21420]
]

const intensity_table = [
[0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507,0.54507],
[0.60562,0.59923,0.59133,0.58213,0.57184,0.56070,0.54892,0.53679,0.52458,0.51262,0.50121,0.49067,0.48128,0.47330,0.46697,0.46249,0.46006,0.45986,0.46203,0.46665,0.47372,0.48312,0.49460,0.50778,0.52217,0.53717,0.55217,0.56652,0.57964,0.59102,0.60027,0.60715,0.61152,0.61342,0.61294,0.61026,0.60562],
[0.62993,0.61663,0.60163,0.58513,0.56721,0.54792,0.52741,0.50597,0.48417,0.46274,0.44252,0.42424,0.40840,0.39524,0.38483,0.37722,0.37262,0.37149,0.37444,0.38211,0.39496,0.41303,0.43591,0.46271,0.49220,0.52288,0.55321,0.58160,0.60660,0.62705,0.64217,0.65166,0.65569,0.65477,0.64966,0.64113,0.62993],
[0.61859,0.59954,0.57951,0.55859,0.53652,0.51281,0.48703,0.45921,0.43010,0.40125,0.37460,0.35184,0.33383,0.32034,0.31043,0.30313,0.29816,0.29624,0.29887,0.30789,0.32478,0.35003,0.38290,0.42162,0.46385,0.50716,0.54918,0.58755,0.62009,0.64502,0.66138,0.66918,0.66921,0.66276,0.65127,0.63614,0.61859],
[0.58434,0.56134,0.53820,0.51511,0.49174,0.46715,0.44010,0.40984,0.37699,0.34382,0.31364,0.28967,0.27359,0.26453,0.25966,0.25610,0.25262,0.24997,0.25053,0.25779,0.27518,0.30435,0.34417,0.39141,0.44206,0.49253,0.54000,0.58194,0.61593,0.64015,0.65395,0.65794,0.65353,0.64245,0.62626,0.60641,0.58434],
[0.53921,0.51448,0.48995,0.46595,0.44250,0.41888,0.39359,0.36521,0.33366,0.30097,0.27115,0.24895,0.23726,0.23477,0.23677,0.23885,0.23920,0.23803,0.23691,0.23986,0.25296,0.28060,0.32245,0.37391,0.42855,0.48085,0.52753,0.56643,0.59562,0.61429,0.62316,0.62341,0.61626,0.60311,0.58508,0.56327,0.53921],
[0.48785,0.46379,0.43988,0.41636,0.39367,0.37182,0.34998,0.32674,0.30099,0.27346,0.24780,0.22959,0.22251,0.22507,0.23198,0.23916,0.24558,0.25057,0.25278,0.25389,0.26060,0.28058,0.31692,0.36595,0.41928,0.46891,0.51065,0.54231,0.56238,0.57214,0.57493,0.57236,0.56426,0.55095,0.53309,0.51149,0.48785],
[0.43209,0.41089,0.38995,0.36941,0.34979,0.33155,0.31470,0.29826,0.28044,0.26067,0.24164,0.22828,0.22418,0.22862,0.23770,0.24867,0.26122,0.27397,0.28296,0.28650,0.28895,0.29863,0.32271,0.36133,0.40653,0.44908,0.48374,0.50731,0.51774,0.51826,0.51530,0.51075,0.50252,0.48985,0.47321,0.45336,0.43209],
[0.37890,0.36283,0.34739,0.33271,0.31922,0.30724,0.29696,0.28780,0.27809,0.26658,0.25432,0.24439,0.23994,0.24247,0.25117,0.26398,0.27930,0.29517,0.30771,0.31403,0.31546,0.31823,0.33068,0.35590,0.38846,0.42051,0.44683,0.46322,0.46680,0.46142,0.45465,0.44832,0.43950,0.42721,0.41228,0.39568,0.37890],
[0.34114,0.33192,0.32348,0.31616,0.31061,0.30672,0.30410,0.30225,0.29980,0.29492,0.28700,0.27755,0.26956,0.26653,0.27083,0.28123,0.29446,0.30791,0.31935,0.32678,0.32987,0.33216,0.33985,0.35562,0.37648,0.39779,0.41572,0.42632,0.42691,0.42012,0.41134,0.40209,0.39087,0.37775,0.36429,0.35181,0.34114],
[0.32818,0.32516,0.32319,0.32283,0.32517,0.32980,0.33535,0.34062,0.34397,0.34296,0.33615,0.32475,0.31211,0.30265,0.30010,0.30443,0.31265,0.32241,0.33228,0.34067,0.34700,0.35327,0.36224,0.37416,0.38773,0.40158,0.41356,0.42060,0.42076,0.41455,0.40362,0.38928,0.37303,0.35700,0.34334,0.33369,0.32818],
[0.33981,0.34000,0.34266,0.34809,0.35721,0.36937,0.38240,0.39400,0.40180,0.40293,0.39568,0.38157,0.36502,0.35110,0.34343,0.34233,0.34605,0.35337,0.36304,0.37282,0.38187,0.39163,0.40273,0.41394,0.42487,0.43601,0.44625,0.45294,0.45399,0.44803,0.43420,0.41393,0.39124,0.37028,0.35389,0.34377,0.33981],
[0.37236,0.37289,0.37826,0.38816,0.40237,0.41956,0.43724,0.45274,0.46333,0.46592,0.45864,0.44316,0.42447,0.40808,0.39741,0.39283,0.39339,0.39860,0.40735,0.41725,0.42701,0.43745,0.44902,0.46095,0.47308,0.48570,0.49764,0.50631,0.50895,0.50305,0.48719,0.46316,0.43591,0.41060,0.39068,0.37789,0.37236],
[0.42245,0.42215,0.42846,0.44064,0.45724,0.47601,0.49435,0.50993,0.52038,0.52304,0.51631,0.50148,0.48288,0.46550,0.45264,0.44515,0.44269,0.44488,0.45083,0.45875,0.46742,0.47714,0.48867,0.50225,0.51759,0.53373,0.54863,0.55948,0.56339,0.55795,0.54232,0.51859,0.49131,0.46537,0.44426,0.42977,0.42245],
[0.48319,0.48226,0.48758,0.49842,0.51308,0.52913,0.54416,0.55622,0.56358,0.56459,0.55836,0.54575,0.52954,0.51323,0.49956,0.48985,0.48445,0.48324,0.48569,0.49085,0.49796,0.50710,0.51894,0.53390,0.55144,0.56981,0.58634,0.59810,0.60259,0.59827,0.58527,0.56571,0.54318,0.52144,0.50331,0.49032,0.48319],
[0.53929,0.53799,0.54070,0.54691,0.55552,0.56497,0.57363,0.58010,0.58328,0.58236,0.57702,0.56775,0.55586,0.54317,0.53137,0.52173,0.51505,0.51167,0.51159,0.51458,0.52039,0.52900,0.54059,0.55506,0.57159,0.58845,0.60334,0.61392,0.61846,0.61626,0.60790,0.59512,0.58032,0.56589,0.55363,0.54459,0.53929],
[0.57278,0.57090,0.57068,0.57187,0.57403,0.57656,0.57878,0.58007,0.57991,0.57795,0.57409,0.56849,0.56162,0.55414,0.54681,0.54040,0.53554,0.53271,0.53223,0.53423,0.53873,0.54564,0.55475,0.56559,0.57735,0.58891,0.59900,0.60643,0.61040,0.61066,0.60758,0.60203,0.59514,0.58801,0.58156,0.57637,0.57278],
[0.57900,0.57728,0.57584,0.57463,0.57360,0.57263,0.57160,0.57039,0.56890,0.56707,0.56489,0.56241,0.55976,0.55710,0.55465,0.55263,0.55127,0.55074,0.55121,0.55273,0.55530,0.55883,0.56314,0.56798,0.57300,0.57785,0.58216,0.58562,0.58802,0.58928,0.58943,0.58865,0.58716,0.58523,0.58309,0.58097,0.57900],
[0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830,0.56830]
]

function interpolate_table(table, latitude_deg, longitude_deg) {
    // interpolate inside a table for a given lat/lon in degrees
    // round down to nearest sampling resolution
    min_lat = Math.floor(latitude_deg / SAMPLING_RES) * SAMPLING_RES
    min_lon = Math.floor(longitude_deg / SAMPLING_RES) * SAMPLING_RES

    // find index of nearest low sampling point
    min_lat_index = Math.floor(-(SAMPLING_MIN_LAT) + min_lat) / SAMPLING_RES
    min_lon_index = Math.floor(-(SAMPLING_MIN_LON) + min_lon) / SAMPLING_RES

    // calculate intensity
    data_sw = table[min_lat_index][min_lon_index]
    data_se = table[min_lat_index][min_lon_index + 1]
    data_ne = table[min_lat_index + 1][min_lon_index + 1]
    data_nw = table[min_lat_index + 1][min_lon_index]

    // perform bilinear interpolation on the four grid corners
    data_min = ((longitude_deg - min_lon) / SAMPLING_RES) * (data_se - data_sw) + data_sw
    data_max = ((longitude_deg - min_lon) / SAMPLING_RES) * (data_ne - data_nw) + data_nw

    value = ((latitude_deg - min_lat) / SAMPLING_RES) * (data_max - data_min) + data_min
    return value
}

function get_mag_field_ef(latitude_deg, longitude_deg) {
    // limit to table bounds
    if (latitude_deg < SAMPLING_MIN_LAT) {
        return
    }
    if (latitude_deg >= SAMPLING_MAX_LAT) {
        return
    }
    if (longitude_deg < SAMPLING_MIN_LON) {
        return
    }
    if (longitude_deg >= SAMPLING_MAX_LON) {
        return
    }

    intensity_gauss = interpolate_table(intensity_table, latitude_deg, longitude_deg)
    declination_deg = interpolate_table(declination_table, latitude_deg, longitude_deg)
    inclination_deg = interpolate_table(inclination_table, latitude_deg, longitude_deg)

    return [declination_deg, inclination_deg, intensity_gauss]
}

function expected_earth_field_lat_lon(lat, lon) {
    // return expected magnetic field for a location
    field_var = get_mag_field_ef(lat, lon)
    if (field_var == null) {
        return
    }
    mag_ef = { x: field_var[2]*1000.0, y:0.0, z:0.0 }
    R = Matrix3()
    R.from_euler(0.0, -field_var[1] * (Math.PI/180), field_var[0] * (Math.PI/180))
    return R.mul(mag_ef)
}
