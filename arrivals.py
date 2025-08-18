import requests
from bs4 import BeautifulSoup
import csv
import os

URL = "https://krakowairport.pl/pl/pasazer/loty/przyloty"


def fetch_arrivals():
    """Fetch arrival data from the airport website."""
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(URL, headers=headers, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.find("table")
    if not table:
        return []

    arrivals = []
    for row in table.find_all("tr"):
        cols = [c.get_text(strip=True) for c in row.find_all("td")]
        if len(cols) >= 4:
            arrivals.append({
                "czas": cols[0],
                "kierunek": cols[1],
                "lot": cols[2],
                "status": cols[3],
            })
    return arrivals


def save_to_csv(data, filename="arrivals.csv"):
    file_exists = os.path.isfile(filename)
    with open(filename, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["czas", "kierunek", "lot", "status"])
        for item in data:
            writer.writerow([item["czas"], item["kierunek"], item["lot"], item["status"]])


if __name__ == "__main__":
    try:
        arrivals = fetch_arrivals()
        if arrivals:
            save_to_csv(arrivals)
            print(f"Zapisano {len(arrivals)} rekordów do arrivals.csv")
        else:
            print("Nie znaleziono danych do zapisania")
    except Exception as e:
        print(f"Błąd podczas pobierania danych: {e}")
