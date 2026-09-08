import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { formatHours, formatToday } from '../format.ts';
import { Chip, ChipButton } from '../components/Chip.tsx';
import { SkeletonList } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoStrip } from '../components/PhotoStrip.tsx';
import { ChevronRight, Compass, Dice, Sliders, Sun, Umbrella, Wind } from '../icons.tsx';
import type { Recommendation, TodayResponse, WeatherPicks } from '../types.ts';
import ui from '../ui.module.css';
import css from './Today.module.css';

const TRAVEL_OPTIONS: { label: string; value?: number }[] = [
  { label: 'Any' },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
];

/** One row on a recommendation card; more would crowd out the reason chips. */
const TODAY_THUMBS = 5;

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
  const [surpriseId, setSurpriseId] = useState<string | null>(null);

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
  const toggle = (key: 'rain' | 'sunny' | 'windy') => {
    setSurpriseId(null);
    setPicks((p) => ({ ...p, [key]: p[key] ? undefined : true }));
  };

  const recommendations = data?.recommendations ?? [];

  // The surprise takes over the hero slot rather than stacking another card above it.
  const hero = recommendations.find((r) => r.place.id === surpriseId) ?? recommendations[0];
  const rest = recommendations.filter((r) => r.place.id !== hero?.place.id);

  function surpriseMe() {
    // Weighted to the top, but any credible option can come up.
    const pool = recommendations.slice(0, 5).filter((r) => r.place.id !== hero?.place.id);
    if (!pool.length) return;
    setSurpriseId(pool[Math.floor(Math.random() * pool.length)].place.id);
  }

  return (
    <div>
      <div className={css.head}>
        <h1 className={css.date}>{formatToday()}</h1>
        <div className={css.weatherRow}>
          <span className={css.weather}>
            {picks.rain ? <Umbrella size={18} /> : picks.windy ? <Wind size={18} /> : <Sun size={18} />}
            {data?.weather?.summary ?? 'Weather not set'}
          </span>
          <button
            type='button'
            className={ui.buttonSmall}
            aria-expanded={showControls}
            onClick={() => setShowControls((v) => !v)}
          >
            <Sliders size={18} />
            {showControls ? 'Done' : 'Adjust'}
          </button>
        </div>

        {showControls && (
          <div className={css.controls}>
            <div className={css.controlGroup}>
              <span className={css.controlLabel}>Conditions</span>
              <div className={css.chipRow}>
                <ChipButton selected={!!picks.rain} icon={<Umbrella size={16} />} onClick={() => toggle('rain')}>
                  Rain
                </ChipButton>
                <ChipButton selected={!!picks.sunny} icon={<Sun size={16} />} onClick={() => toggle('sunny')}>
                  Sunny
                </ChipButton>
                <ChipButton selected={!!picks.windy} icon={<Wind size={16} />} onClick={() => toggle('windy')}>
                  Windy
                </ChipButton>
              </div>
            </div>

            <div className={css.controlGroup}>
              <span className={css.controlLabel}>Temperature</span>
              <div className={css.tempRow}>
                <span className={css.tempWrap}>
                  <input
                    className={ui.inputSmall}
                    type='number'
                    inputMode='numeric'
                    placeholder='°C'
                    aria-label='Temperature in Celsius'
                    value={picks.temperatureC ?? ''}
                    onChange={(e) =>
                      setPicks((p) => ({
                        ...p,
                        temperatureC: e.target.value === '' ? undefined : Number(e.target.value),
                      }))}
                  />
                </span>
                <span className={ui.metaQuiet}>Leave blank if you are not sure</span>
              </div>
            </div>

            <div className={css.controlGroup}>
              <span className={css.controlLabel}>Max travel</span>
              <div className={css.chipRow}>
                {TRAVEL_OPTIONS.map((o) => (
                  <ChipButton
                    key={o.label}
                    selected={maxTravel === o.value}
                    onClick={() => setMaxTravel(o.value)}
                  >
                    {o.label}
                  </ChipButton>
                ))}
              </div>
            </div>

            <div className={css.controlGroup}>
              <span className={css.controlLabel}>Time available</span>
              <div className={css.chipRow}>
                {TIME_OPTIONS.map((o) => (
                  <ChipButton
                    key={o.label}
                    selected={available === o.value}
                    onClick={() => setAvailable(o.value)}
                  >
                    {o.label}
                  </ChipButton>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className={ui.error}>{error}</p>}

      {!data && !error && <SkeletonList count={3} />}

      {data && recommendations.length === 0 && (
        data.totalPlaces === 0
          ? (
            <EmptyState
              icon={<Compass size={26} />}
              headline='Nothing to choose from yet'
              body='Add a few places your family likes and this page will start suggesting one.'
              actionLabel='Add your first place'
              onAction={() => navigate('/places/new')}
            />
          )
          : (
            <EmptyState
              icon={<Sliders size={26} />}
              headline='Nothing fits today'
              body='Every place was filtered out by the conditions you set. Try relaxing them.'
              actionLabel='Adjust conditions'
              onAction={() => setShowControls(true)}
            />
          )
      )}

      {hero && (
        <>
          <span className={ui.sectionTitle}>{surpriseId ? "Let's do this" : 'Top pick'}</span>
          <div
            className={css.hero}
            role='button'
            tabIndex={0}
            onClick={() => navigate(`/places/${hero.place.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/places/${hero.place.id}`)}
          >
            <div className={css.heroName}>{hero.place.name}</div>
            <PhotoStrip ids={hero.place.photoIds.slice(0, TODAY_THUMBS)} />
            <div className={css.heroMeta}>{describePlace(hero)}</div>
            <div className={css.heroChips}>
              {hero.reasons.map((r) => <Chip key={r} tone='accent'>{r}</Chip>)}
            </div>
            <div className={css.heroActions}>
              <span className={css.heroGo}>Let's go</span>
            </div>
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          <span className={ui.sectionTitle}>Also good</span>
          {rest.map((r) => (
            <button
              key={r.place.id}
              type='button'
              className={css.item}
              onClick={() => navigate(`/places/${r.place.id}`)}
            >
              <span className={css.itemBody}>
                <span className={css.itemName}>{r.place.name}</span>
                <PhotoStrip ids={r.place.photoIds.slice(0, TODAY_THUMBS)} />
                <span className={ui.metaQuiet}>{describePlace(r)}</span>
                <span className={css.itemChips}>
                  {r.reasons.slice(0, 2).map((reason) => <Chip key={reason}>{reason}</Chip>)}
                </span>
              </span>
              <ChevronRight size={20} className={css.chevron} />
            </button>
          ))}
        </>
      )}

      {recommendations.length > 1 && (
        <div className={css.footer}>
          <button type='button' className={ui.buttonQuiet} onClick={surpriseMe}>
            <Dice size={18} />
            Surprise me
          </button>
          {data && data.excludedCount > 0 && (
            <p className={css.filtered}>
              {data.excludedCount} {data.excludedCount === 1 ? 'place' : 'places'} filtered out by today's conditions
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function describePlace(r: Recommendation): string {
  const p = r.place;
  const parts: string[] = [p.environment];
  if (p.typicalDurationHours) parts.push(`about ${formatHours(p.typicalDurationHours)}`);
  if (p.costLevel) parts.push(p.costLevel === 'free' ? 'free' : `${p.costLevel} cost`);
  return parts.join(' · ');
}
