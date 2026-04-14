#!/usr/bin/env python3
"""
Скрипт для загрузки беговых тренировок из Garmin Connect.
Сохраняет данные в JSON-файл для дашборда.

Установка зависимостей:
    pip install garminconnect

Использование:
    python garmin_fetch.py

При первом запуске запросит email и пароль от Garmin Connect.
Токен сохраняется локально для последующих запусков.
"""

import json
import os
import re
import sys
import getpass
from datetime import datetime, timedelta
from pathlib import Path

# Добавляем локальную папку libs/ в путь поиска модулей
# (используется когда скрипт запускается из sandbox Claude)
_SCRIPT_DIR = Path(__file__).parent.resolve()
_LIBS_DIR = _SCRIPT_DIR / "libs"
if _LIBS_DIR.exists() and str(_LIBS_DIR) not in sys.path:
    sys.path.insert(0, str(_LIBS_DIR))

try:
    from garminconnect import Garmin
except ImportError:
    print("Библиотека garminconnect не установлена.")
    print("Запустите 'Обновить тренировки.command' для установки,")
    print("или выполните: pip install garminconnect --target=libs/")
    sys.exit(1)

# --- Настройки ---
# Путь к директории скрипта и корню проекта
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
# Период загрузки (по умолчанию — последние 6 месяцев)
MONTHS_BACK = 6
# Файл для сохранения данных (в public/data/ для веб-сервера)
OUTPUT_FILE = PROJECT_DIR / "public" / "data" / "garmin_data.json"
# Файл для токена сессии
TOKEN_FILE = SCRIPT_DIR / ".garmin_token"
# JSX дашборд (больше не обновляем встроенные данные — загрузка через fetch)
DASHBOARD_FILE = None


def authenticate():
    """Аутентификация в Garmin Connect с сохранением токена."""

    # Пробуем загрузить сохранённый токен
    if TOKEN_FILE.exists():
        try:
            with open(TOKEN_FILE, "r") as f:
                token_data = json.load(f)
            client = Garmin()
            client.login(token_data)
            print("Авторизация через сохранённый токен — OK")
            return client
        except Exception:
            print("Сохранённый токен устарел, нужна повторная авторизация.")
            TOKEN_FILE.unlink()

    # Запрашиваем логин и пароль
    print("\n=== Вход в Garmin Connect ===")
    email = input("Email: ").strip()
    password = getpass.getpass("Пароль: ")

    try:
        client = Garmin(email, password)
        client.login()
        print("Авторизация — OK")

        # Сохраняем токен
        token_data = client.session_data
        with open(TOKEN_FILE, "w") as f:
            json.dump(token_data, f)
        print(f"Токен сохранён в {TOKEN_FILE}")

        return client
    except Exception as e:
        print(f"Ошибка авторизации: {e}")
        sys.exit(1)


def fetch_activities(client, months_back=MONTHS_BACK):
    """Загружает все беговые активности за указанный период."""

    end_date = datetime.now()
    start_date = end_date - timedelta(days=months_back * 30)

    print(f"\nЗагрузка активностей с {start_date.strftime('%Y-%m-%d')} по {end_date.strftime('%Y-%m-%d')}...")

    activities = client.get_activities_by_date(
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d"),
        activitytype="running"
    )

    print(f"Найдено беговых тренировок: {len(activities)}")
    return activities


def fetch_activity_details(client, activity_id):
    """Загружает детальные данные по конкретной активности."""
    try:
        details = client.get_activity(activity_id)
        return details
    except Exception as e:
        print(f"  Ошибка загрузки деталей для {activity_id}: {e}")
        return None


def fetch_splits(client, activity_id):
    """Загружает сплиты (по километрам) для активности."""
    try:
        splits = client.get_activity_splits(activity_id)
        return splits
    except Exception as e:
        print(f"  Ошибка загрузки сплитов для {activity_id}: {e}")
        return None


def fetch_hr_zones(client, activity_id):
    """Загружает пульсовые зоны для активности."""
    try:
        hr = client.get_activity_hr_in_timezones(activity_id)
        return hr
    except Exception as e:
        return None


def process_activity(activity, details, splits):
    """Обрабатывает данные одной активности в удобный формат."""

    # Базовые данные из списка активностей
    result = {
        "id": activity.get("activityId"),
        "name": activity.get("activityName", "Бег"),
        "date": activity.get("startTimeLocal", ""),
        "type": activity.get("activityType", {}).get("typeKey", "running"),

        # Дистанция (Garmin отдаёт в метрах)
        "distance_m": activity.get("distance", 0),
        "distance_km": round(activity.get("distance", 0) / 1000, 2),

        # Время (в секундах)
        "duration_s": activity.get("duration", 0),
        "moving_duration_s": activity.get("movingDuration", 0),
        "elapsed_duration_s": activity.get("elapsedDuration", 0),

        # Темп (Garmin отдаёт средний в м/с, мы конвертируем в мин/км)
        "avg_speed_mps": activity.get("averageSpeed", 0),
        "max_speed_mps": activity.get("maxSpeed", 0),

        # Пульс
        "avg_hr": activity.get("averageHR", None),
        "max_hr": activity.get("maxHR", None),

        # Каденс
        "avg_cadence": activity.get("averageRunningCadenceInStepsPerMinute", None),
        "max_cadence": activity.get("maxRunningCadenceInStepsPerMinute", None),

        # Высота
        "elevation_gain": activity.get("elevationGain", 0),
        "elevation_loss": activity.get("elevationLoss", 0),

        # Калории
        "calories": activity.get("calories", 0),

        # Training Effect
        "aerobic_te": activity.get("aerobicTrainingEffect", None),
        "anaerobic_te": activity.get("anaerobicTrainingEffect", None),

        # VO2Max
        "vo2max": activity.get("vO2MaxValue", None),

        # Training Load
        "training_load": activity.get("trainingEffectLabel", None),

        # Длина шага
        "avg_stride_length": activity.get("avgStrideLength", None),

        # Ground Contact Time
        "avg_ground_contact_time": activity.get("avgGroundContactTime", None),

        # Vertical Oscillation
        "avg_vertical_oscillation": activity.get("avgVerticalOscillation", None),
    }

    # Конвертируем темп в мин/км
    if result["avg_speed_mps"] and result["avg_speed_mps"] > 0:
        pace_s_per_km = 1000 / result["avg_speed_mps"]
        result["avg_pace_min_km"] = round(pace_s_per_km / 60, 2)
        result["avg_pace_formatted"] = format_pace(pace_s_per_km)
    else:
        result["avg_pace_min_km"] = None
        result["avg_pace_formatted"] = None

    if result["max_speed_mps"] and result["max_speed_mps"] > 0:
        max_pace_s_per_km = 1000 / result["max_speed_mps"]
        result["max_pace_formatted"] = format_pace(max_pace_s_per_km)

    # Форматируем длительность
    result["duration_formatted"] = format_duration(result["duration_s"])

    # Обрабатываем сплиты
    if splits and "lapDTOs" in splits:
        result["splits"] = []
        for lap in splits["lapDTOs"]:
            split = {
                "distance_m": lap.get("distance", 0),
                "duration_s": lap.get("duration", 0),
                "avg_hr": lap.get("averageHR", None),
                "max_hr": lap.get("maxHR", None),
                "avg_cadence": lap.get("averageRunCadence", None),
                "elevation_gain": lap.get("elevationGain", 0),
                "avg_speed_mps": lap.get("averageSpeed", 0),
            }
            if split["avg_speed_mps"] and split["avg_speed_mps"] > 0:
                pace_s = 1000 / split["avg_speed_mps"]
                split["pace_formatted"] = format_pace(pace_s)
                split["pace_min_km"] = round(pace_s / 60, 2)
            result["splits"].append(split)

    # Данные из деталей
    if details:
        result["description"] = details.get("description", "")
        result["avg_power"] = details.get("avgPower", None)
        result["max_power"] = details.get("maxPower", None)
        result["normalized_power"] = details.get("normPower", None)
        result["lactate_threshold"] = details.get("lactateThreshold", None)

    return result


def format_pace(seconds_per_km):
    """Форматирует темп в мин:сек/км."""
    minutes = int(seconds_per_km // 60)
    seconds = int(seconds_per_km % 60)
    return f"{minutes}:{seconds:02d}"


def format_duration(total_seconds):
    """Форматирует длительность в ч:мм:сс."""
    if not total_seconds:
        return "0:00"
    total_seconds = int(total_seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def update_dashboard(data):
    """Обновляет встроенные данные в JSX-дашборде (устаревшее, данные теперь через fetch)."""
    if not DASHBOARD_FILE or not DASHBOARD_FILE.exists():
        print(f"  Дашборд не найден: {DASHBOARD_FILE}")
        return

    # Подготовим компактные данные для дашборда (без сплитов и лишних полей)
    dashboard_data = {
        "meta": data["meta"],
        "activities": []
    }
    for a in data["activities"]:
        dashboard_data["activities"].append({
            "id": a.get("id"),
            "name": a.get("name"),
            "type": a.get("type", "running"),
            "date": a.get("date"),
            "distance_km": a.get("distance_km"),
            "distance_m": a.get("distance_m"),
            "duration_s": a.get("duration_s"),
            "duration_formatted": a.get("duration_formatted"),
            "avg_speed_mps": a.get("avg_speed_mps"),
            "avg_pace_min_km": a.get("avg_pace_min_km"),
            "avg_pace_formatted": a.get("avg_pace_formatted"),
            "avg_hr": a.get("avg_hr"),
            "max_hr": a.get("max_hr"),
            "avg_cadence": a.get("avg_cadence"),
            "elevation_gain": a.get("elevation_gain"),
            "calories": a.get("calories"),
            "aerobic_te": a.get("aerobic_te"),
            "anaerobic_te": a.get("anaerobic_te"),
            "vo2max": a.get("vo2max"),
        })

    jsx_content = DASHBOARD_FILE.read_text(encoding="utf-8")

    # Заменяем RAW_DATA между маркерами
    new_json = json.dumps(dashboard_data, ensure_ascii=False)
    pattern = r'(const RAW_DATA = ).*?(;\s*// === END EMBEDDED DATA ===)'
    replacement = rf'\g<1>{new_json}\g<2>'
    new_content = re.sub(pattern, replacement, jsx_content, flags=re.DOTALL)

    if new_content == jsx_content:
        print("  Предупреждение: маркеры RAW_DATA не найдены в дашборде, файл не изменён.")
        return

    DASHBOARD_FILE.write_text(new_content, encoding="utf-8")
    print(f"  Дашборд обновлён: {DASHBOARD_FILE}")


def main():
    print("=" * 50)
    print("  GARMIN CONNECT — Загрузка беговых тренировок")
    print("=" * 50)

    # 1. Авторизация
    client = authenticate()

    # 2. Загрузка списка активностей
    activities = fetch_activities(client)

    if not activities:
        print("Беговые тренировки не найдены за указанный период.")
        sys.exit(0)

    # 3. Загрузка деталей по каждой тренировке
    all_data = []
    total = len(activities)

    for i, activity in enumerate(activities, 1):
        aid = activity.get("activityId")
        name = activity.get("activityName", "Бег")
        date = activity.get("startTimeLocal", "")[:10]
        dist = round(activity.get("distance", 0) / 1000, 1)

        print(f"  [{i}/{total}] {date} — {name} ({dist} км)")

        # Загружаем детали и сплиты
        details = fetch_activity_details(client, aid)
        splits = fetch_splits(client, aid)

        processed = process_activity(activity, details, splits)
        all_data.append(processed)

    # 4. Сортируем по дате
    all_data.sort(key=lambda x: x["date"])

    # 5. Добавляем метаданные
    dates = [a["date"][:10] for a in all_data if a.get("date")]
    date_range = f"{min(dates)} — {max(dates)}" if dates else ""

    output = {
        "meta": {
            "exported_at": datetime.now().isoformat(),
            "source": "Garmin Connect API (garminconnect)",
            "period_months": MONTHS_BACK,
            "total_activities": len(all_data),
            "total_distance_km": round(sum(a["distance_km"] for a in all_data), 1),
            "date_range": date_range,
        },
        "activities": all_data
    }

    # 6. Сохраняем JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n  Данные сохранены в {OUTPUT_FILE}")
    print(f"  Всего тренировок: {len(all_data)}")
    print(f"  Общая дистанция: {output['meta']['total_distance_km']} км")

    # 7. Обновляем JSX дашборд
    update_dashboard(output)

    print(f"\n{'=' * 50}")
    print(f"  Готово! Дашборд обновлён.")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
