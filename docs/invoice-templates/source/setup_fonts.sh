#!/usr/bin/env bash
# تثبيت خط Tajawal وحزم الرِندر (مرة واحدة)
pip install weasyprint pymupdf --break-system-packages -q
mkdir -p ~/.fonts && cd ~/.fonts
B=https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal
for w in Light Regular Medium Bold ExtraBold Black; do
  curl -sL -o "Tajawal-$w.ttf" "$B/Tajawal-$w.ttf"
done
fc-cache -f
echo "Done: Tajawal installed."
