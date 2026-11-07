"""Fetch and cache public BoatraceCSV datasets without altering their schema."""
import datetime as dt
import pathlib
import urllib.request
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATASETS = ['programs/race_cards', 'programs/title', 'programs/recent_national', 'programs/recent_local', 'programs/motor_stats', 'previews/tkz', 'previews/stt', 'previews/sui', 'results/realtime', 'results/payouts']

def main():
    day = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv)>1 else dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    for dataset in DATASETS:
        relative = f'{dataset}/{day:%Y/%m/%d}.csv'
        url = f'https://boatracecsv.github.io/data/{relative}'
        target = ROOT / 'data' / 'cache' / relative
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'BoatAI-v2/1.0 (public-data-cache)'})
            with urllib.request.urlopen(req, timeout=25) as response:
                content = response.read()
            if not content: raise ValueError('empty response')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            print('OK', relative, len(content))
        except Exception as exc:
            print('SKIP', relative, exc)

if __name__ == '__main__': main()
