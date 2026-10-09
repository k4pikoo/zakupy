# Zakupy z przepisów

Prywatna apka na iPhone'a: wybierasz dania na tydzień, a ona sumuje składniki w gramach i układa listę zakupów według działów sklepu. Ma skaner kodów kreskowych (Open Food Facts). Działa bez internetu. Wszystkie dane są tylko na Twoim telefonie.

## Jak wrzucić na GitHub Pages (5 minut, za darmo)

1. Na github.com kliknij **New repository**, nazwij je np. `zakupy`, zostaw **Public**, kliknij **Create repository**.
2. Na stronie repozytorium kliknij link **uploading an existing file** i przeciągnij wszystkie pliki z tego folderu (nie sam folder). Kliknij **Commit changes**.
3. Wejdź w **Settings → Pages**. W „Build and deployment” wybierz **Deploy from a branch**, gałąź **main**, folder **/ (root)**, kliknij **Save**.
4. Po około minucie apka będzie pod adresem `https://TWOJ-LOGIN.github.io/zakupy/`.

## Instalacja na iPhonie

1. Otwórz ten adres w **Safari** (nie w Chrome).
2. Kliknij **Udostępnij → Do ekranu początkowego**.
3. Uruchamiaj apkę z ikony. Przy pierwszym skanowaniu zezwól na dostęp do kamery.

## Dodawanie przepisów

- **Ręcznie:** Przepisy → Nowy, potem wpisuj składniki np. `120 g mięso mielone`.
- **Wklejanie wielu naraz:** jeden składnik w linii, np. `Ogórek kiszony 1.2 średnia sztuka / 80g`.
- **Ze zrzutów ekranu:** wyślij Claude'owi zrzuty i poproś o JSON w formacie poniżej, potem wklej go w Przepisy → „Kopia zapasowa i import przepisów”.

```json
[{"name": "Nazwa dania", "servings": 1, "kcal": 604,
  "items": [{"name": "Cebula", "qty": 0.2, "unit": "średnia sztuka", "g": 25, "brand": ""}]}]
```

Najważniejsze są gramy (`g`): po nich apka sumuje ten sam produkt z różnych przepisów.

## Aktualizacje

Podmień zmienione pliki w repozytorium (Add file → Upload files). Telefon pobierze nową wersję w tle i pokaże ją przy kolejnym uruchomieniu.

## Kopia zapasowa

Dane są tylko w telefonie. Raz na jakiś czas: Przepisy → „Kopia zapasowa i import przepisów” → **Zapisz kopię** (zapisz plik w aplikacji Pliki).

Dane i zdjęcia produktów ze skanera: [Open Food Facts](https://world.openfoodfacts.org) (ODbL, CC BY-SA).
