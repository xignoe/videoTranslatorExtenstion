#!/bin/bash
# Generates ~25 s news-style speech clips with macOS `say`, converts them to WebM
# (VP9 blue video track + Opus audio, speech starting ~0.1 s in) and builds mixed.webm = en>es>ja>en.
set -euo pipefail
cd "$(dirname "$0")/fixtures/clips"

EN="Good evening. A powerful storm is moving across the northern coast tonight, and the weather service has issued a severe warning for the whole region. Forecasters expect heavy rain and strong wind until tomorrow morning. Meanwhile, the city council approved a new budget that increases funding for every public school in the district. The forecast for the weekend calls for clear skies and cooler temperatures. That is all for tonight. Thank you for listening to the evening news."
ES="Buenas noches. Una fuerte tormenta avanza esta noche por la costa norte, y el servicio meteorológico emitió una alerta grave para toda la región. Los meteorólogos esperan lluvias intensas y viento fuerte hasta mañana por la mañana. Mientras tanto, el ayuntamiento aprobó un nuevo presupuesto que aumenta los fondos para cada escuela pública del distrito. El pronóstico del tiempo para el fin de semana anuncia cielos despejados y temperaturas más frescas. Eso es todo por esta noche. Gracias por escuchar las noticias."
JA="こんばんは。今夜、強い嵐が北の海岸を通過しており、気象庁は地域全体に厳重な警報を発表しました。予報によると、明日の朝まで激しい雨と強い風が続く見込みです。一方、市議会は地区内のすべての公立学校への予算を増やす新しい予算案を承認しました。週末の天気予報は晴れで、気温は少し低くなるでしょう。今夜のニュースは以上です。ご視聴ありがとうございました。"

gen() { # name voice text
  local name=$1 voice=$2 text=$3
  if [ ! -f "$name.webm" ]; then
    say -v "$voice" -r 175 -o "$name.aiff" "$text"
    ffmpeg -y -loglevel error -f lavfi -i "color=c=blue:s=320x180:r=15" -i "$name.aiff" \
      -af "adelay=100|100,aformat=channel_layouts=mono,apad=pad_dur=0.6" -ar 48000 \
      -c:v libvpx-vp9 -b:v 150k -c:a libopus -b:a 64k -shortest "$name.webm"
    rm -f "$name.aiff"
  fi
  echo "$name.webm: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$name.webm") s"
}
gen en Samantha "$EN"
gen es Paulina "$ES"
gen ja Kyoko "$JA"
if [ ! -f mixed.webm ]; then
  printf "file 'en.webm'\nfile 'es.webm'\nfile 'ja.webm'\nfile 'en.webm'\n" > list.txt
  ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy mixed.webm
  rm -f list.txt
  echo "mixed.webm: $(ffprobe -v error -show_entries format=duration -of csv=p=0 mixed.webm) s"
fi
