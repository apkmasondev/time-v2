# APKMASON Automatic — interaktywna prezentacja w 3D

**Zobacz na żywo: [apkmason.dev/time-v2](https://apkmason.dev/time-v2/)**

Strona demonstracyjna pokazująca, jak może wyglądać premium prezentacja produktu w przeglądarce: filmowe intro płynnie przechodzi w model zegarka renderowany na żywo, a kolejne rozdziały opowiada scroll. APKMASON to marka pokazowa. Strona nie jest ofertą handlową.

## Co jest w środku

- **Model 3D w czasie rzeczywistym** (three.js). Stal szczotkowana i polerowana, tarcza sunburst, szkło szafirowe i grawerowany dekiel. Wskazówki i data pokazują aktualny czas.
- **Rozdziały sterowane scrollem:** koperta, makro bransolety, tarcza, widok rozstrzelony z opisem dziewięciu elementów, w tym mechanizmu.
- **„Na nadgarstku”:** dwa filmy, dzień i noc, łączone w dyptyk.
- **Konfigurator:** pięć tarcz (żółta w wersji bez datownika), trzy oświetlenia studyjne, podgląd dekla, obrót przeciąganiem. Przerywnik i finał pokazują film z wybraną tarczą.
- **Finał w kolorze wybranej tarczy:** film przenika się do wybranego wariantu w tym samym momencie ujęcia.
- **Specyfikacja** w formie karty danych manufaktury, z rysunkiem technicznym.
- **Ścieżka dźwiękowa** (opcjonalna): muzyka intro zsynchronizowana z filmem i osobny utwór do przerywnika, pobierany tylko po włączeniu dźwięku.
- **Wersje PL / EN**, pełna obsługa telefonów, respektowanie ustawienia „ogranicz ruch”.

## Uruchomienie lokalne

Wymagany Node.js 20.19+ lub 22.12+.

```bash
npm install
npm run dev       # http://127.0.0.1:5173  (?skip pomija ekran startowy i film)
npm run build     # statyczna strona w dist/
npm run preview
```

Każdy push na gałąź `main` buduje stronę i publikuje ją na GitHub Pages (`.github/workflows/deploy.yml`).

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `index.html` | Treść i struktura strony. |
| `src/main.js` | Loader, intro, choreografia scrolla, konfigurator, filmy, muzyka, menu. |
| `src/scene.js` | Scena 3D: materiały, postument z odbiciem, widok rozstrzelony, wskazówki. |
| `src/textures.js` | Proceduralne tekstury: nadruk tarczy, sunburst, szczotkowana stal, grawer. |
| `src/env.js` | Wirtualne studio fotograficzne: Studio, Noc, Złota godzina. |
| `src/i18n.js` | Teksty PL / EN i specyfikacja. |
| `public/models/` | Model zegarka (glTF, kompresja meshopt). |
| `public/video/`, `public/img/` | Filmy w wersjach 1080p i 720p oraz ich plakaty. Przerywnik i finał mają wersję dla każdej z pięciu tarcz. |
| `public/audio/` | Muzyka przerywnika. |
| `public/seq/` | Klatki makro bransolety przewijane scrollem. |

## Technologie

[three.js](https://threejs.org) · [GSAP ScrollTrigger](https://gsap.com) · [Lenis](https://lenis.darkroom.engineering) · [Vite](https://vite.dev)

Model zegarka zbudowano proceduralnie w Blenderze. Filmy wygenerowano z pomocą AI, a potem przycięto i dopasowano kolorystycznie.
