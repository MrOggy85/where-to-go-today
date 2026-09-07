import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import type { Recommendation, TodayResponse, WeatherPicks } from '../types.ts';
import ui from '../ui.module.css';
import css from './Today.module.css';

const TRAVEL_OPTIONS: { label: string; value?: number }[] = [
  { label: 'Any' },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
];

const TIME_OPTIONS: { label: string; value?: number }[] = [
  { label: 'All day' },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: 'Half day', value: 240 },
];

export function Today() {
  const [picks, setPicks] = useState<WeatherPicks>({});
  const [maxTravel, setMaxTravel] = useState<number | undefined>();
  const [available, setAvailable] = useState<number | undefined>();
  const [showControls, setShowControls] = useState(false);
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<Recommendation | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.today(picks, maxTravel, available));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load recommendations');
    }
  }, [picks, maxTravel, available]);

  useEffect(() => {
    load();
  }, [load]);

  // Toggling off clears the flag entirely: "not set" is different from "no rain".
  const toggle = (key: 'rain' | 'sunny' | 'windy') => setPicks((p) => ({ ...p, [key]: p[key] ? undefined : true }));

  function pickOne() {
    const options = data?.recommendations ?? [];
    if (!options.length) return;
    // Weighted to the top of the list, but any credible option can come up.
    const top = options.slice(0, 5);
    setSurprise(top[Math.floor(Math.random() * top.length)]);
  }

  return (
    <div>
      <div className={css.weatherBar}>
        <span>{data?.weather?.summary ?? 'No weather set'}</span>
        <button type='button' className={ui.button} onClick={() => setShowControls((v) => !v)}>
          {showControls ? 'Hide' : 'Adjust'}
        </button>
      </div>

      {showControls && (
        <div className={css.controls}>
          <div className={css.controlGroup}>
            <span className={css.controlLabel}>Conditions</span>
            <div className={ui.row}>
              <button type='button' className={picks.rain ? ui.toggleOn : ui.toggle} onClick={() => toggle('rain')}>
                Rain
              </button>
              <button type='button' className={picks.sunny ? ui.toggleOn : ui.toggle} onClick={() => toggle('sunny')}>
                Sunny
              </button>
              <button type='button' className={picks.windy ? ui.toggleOn : ui.toggle} onClick={() => toggle('windy')}>
                Windy
              </button>
            </div>
          </div>

          <div className={css.controlGroup}>
            <span className={css.controlLabel}>Temperature</span>
            <div className={css.tempRow}>
              <input
                className={css.tempInput}
                type='number'
                inputMode='numeric'
                placeholder='°C'
                value={picks.temperatureC ?? ''}
                onChange={(e) =>
                  setPicks((p) => ({ ...p, temperatureC: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
              <span className={ui.meta}>Leave blank if you are not sure</span>
            </div>
          </div>

          <div className={css.controlGroup}>
            <span className={css.controlLabel}>Max travel</span>
            <div className={ui.row}>
              {TRAVEL_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type='button'
                  className={maxTravel === o.value ? ui.toggleOn : ui.toggle}
                  onClick={() => setMaxTravel(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className={css.controlGroup}>
            <span className={css.controlLabel}>Time available</span>
            <div className={ui.row}>
              {TIME_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type='button'
                  className={available === o.value ? ui.toggleOn : ui.toggle}
                  onClick={() => setAvailable(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className={ui.error}>{error}</p>}

      {surprise && (
        <div className={css.pick}>
          <div className={css.pickLabel}>Let's do this</div>
          <div className={ui.name}>{surprise.place.name}</div>
          <Reasons reasons={surprise.reasons} />
          <div className={ui.spacer} />
          <div className={ui.row}>
            <button type='button' className={ui.buttonPrimary} onClick={() => navigate(`/places/${surprise.place.id}`)}>
              Open
            </button>
            <button type='button' className={ui.button} onClick={pickOne}>Something else</button>
            <button type='button' className={ui.button} onClick={() => setSurprise(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <h2>Good choices today</h2>
      <div className={ui.spacer} />

      {data && data.recommendations.length === 0 && (
        <p className={ui.empty}>
          {data.totalPlaces === 0
            ? 'No places yet. Add one to get started.'
            : 'Nothing fits those conditions. Try relaxing the filters.'}
        </p>
      )}

      {data?.recommendations.map((r) => (
        <button
          key={r.place.id}
          type='button'
          className={ui.cardLink}
          onClick={() => navigate(`/places/${r.place.id}`)}
        >
          <div className={ui.name}>{r.place.name}</div>
          <div className={ui.meta}>{describePlace(r)}</div>
          <Reasons reasons={r.reasons} />
        </button>
      ))}

      {!!data?.recommendations.length && (
        <>
          <button type='button' className={ui.buttonWide} onClick={pickOne}>Surprise me</button>
          {data.excludedCount > 0 && (
            <p className={ui.meta}>{data.excludedCount} place(s) filtered out by today's conditions.</p>
          )}
        </>
      )}
    </div>
  );
}

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <div className={ui.reasons}>
      {reasons.map((r) => <span key={r} className={ui.reason}>{r}</span>)}
    </div>
  );
}

function describePlace(r: Recommendation): string {
  const p = r.place;
  const parts: string[] = [p.environment];
  if (p.typicalDurationMinutes) parts.push(`about ${formatMinutes(p.typicalDurationMinutes)}`);
  if (p.costLevel) parts.push(p.costLevel === 'free' ? 'free' : `${p.costLevel} cost`);
  return parts.join(' · ');
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const hours = min / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}
