# Модули сайта (Ops kill-switch)

Управление: TECH → `/ops` или `POST /api/ops/flags`.

Публичный статус (без секретов): `GET /api/public/status` → поле `modules`.

## Правила

- Нет ключа в JSON = модуль **включён** (fail-open для отсутствующих ключей).  
- TECH всегда проходит.  
- `MODULE_FLAGS_FORCE_ON=1` — аварийно включает всё.  
- Сборка сайта должна показывать `ƒ Proxy (Middleware)` (`next build --webpack`).

## Быстрые команды проверки

```bash
# статус
curl -sS https://young.idivles.ru/api/public/status | jq '.modules,.maintenanceMode'

# после выключения events TECH-ом:
curl -sSI https://young.idivles.ru/events | head
# 307 Location: /unavailable?m=events
```

## Синхронизация с legacy-полями SiteSettings

При сохранении флагов также обновляются:

- `registrationEnabled`  
- `messagingEnabled`  
- `galleryPageEnabled`  
- `maintenanceMode` (инверсия флага `maintenance`)
