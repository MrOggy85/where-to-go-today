import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { ChevronDown } from '../icons.tsx';
import type { CostLevel, Place, PlaceEnvironment, PlaceStatus, Tristate } from '../types.ts';
import ui from '../ui.module.css';
import css from './PlaceForm.module.css';

/** Everything the form edits, as strings so inputs stay controlled and empty means "unset". */
interface FormState {
  name: string;
  environment: PlaceEnvironment;
  status: PlaceStatus;
  googleMapsUrl: string;
  websiteUrl: string;
  address: string;
  categories: string;
  driveMinutes: string;
  trainMinutes: string;
  typicalDurationMinutes: string;
  costLevel: string;
  priority: string;
  preferredCooldownDays: string;
  goodForRain: string;
  goodForHotWeather: string;
  goodForColdWeather: string;
  goodForWind: string;
  shaded: string;
  parking: string;
  strollerFriendly: string;
  foodAvailable: string;
  toilets: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  environment: 'outdoor',
  status: 'active',
  googleMapsUrl: '',
  websiteUrl: '',
  address: '',
  categories: '',
  driveMinutes: '',
  trainMinutes: '',
  typicalDurationMinutes: '',
  costLevel: '',
  priority: '1',
  preferredCooldownDays: '',
  goodForRain: '',
  goodForHotWeather: '',
  goodForColdWeather: '',
  goodForWind: '',
  shaded: '',
  parking: '',
  strollerFriendly: '',
  foodAvailable: '',
  toilets: '',
  notes: '',
};

function fromPlace(p: Place): FormState {
  const bool = (v?: boolean) => (v === undefined ? '' : String(v));
  const num = (v?: number) => (v === undefined ? '' : String(v));
  return {
    name: p.name,
    environment: p.environment,
    status: p.status,
    googleMapsUrl: p.googleMapsUrl ?? '',
    websiteUrl: p.websiteUrl ?? '',
    address: p.address ?? '',
    categories: p.categories.join(', '),
    driveMinutes: num(p.driveMinutes),
    trainMinutes: num(p.trainMinutes),
    typicalDurationMinutes: num(p.typicalDurationMinutes),
    costLevel: p.costLevel ?? '',
    priority: String(p.priority),
    preferredCooldownDays: num(p.preferredCooldownDays),
    goodForRain: bool(p.goodForRain),
    goodForHotWeather: bool(p.goodForHotWeather),
    goodForColdWeather: bool(p.goodForColdWeather),
    goodForWind: bool(p.goodForWind),
    shaded: bool(p.shaded),
    parking: p.parking ?? '',
    strollerFriendly: p.strollerFriendly ?? '',
    foodAvailable: p.foodAvailable ?? '',
    toilets: p.toilets ?? '',
    notes: p.notes ?? '',
  };
}

function toBody(f: FormState) {
  const num = (v: string) => (v === '' ? null : Number(v));
  const bool = (v: string) => (v === '' ? null : v === 'true');
  const text = (v: string) => (v.trim() === '' ? null : v.trim());

  return {
    name: f.name.trim(),
    environment: f.environment,
    status: f.status,
    googleMapsUrl: text(f.googleMapsUrl),
    websiteUrl: text(f.websiteUrl),
    address: text(f.address),
    categories: f.categories.split(',').map((c) => c.trim()).filter(Boolean),
    driveMinutes: num(f.driveMinutes),
    trainMinutes: num(f.trainMinutes),
    typicalDurationMinutes: num(f.typicalDurationMinutes),
    costLevel: text(f.costLevel) as CostLevel | null,
    priority: Number(f.priority) || 1,
    preferredCooldownDays: num(f.preferredCooldownDays),
    goodForRain: bool(f.goodForRain),
    goodForHotWeather: bool(f.goodForHotWeather),
    goodForColdWeather: bool(f.goodForColdWeather),
    goodForWind: bool(f.goodForWind),
    shaded: bool(f.shaded),
    parking: text(f.parking) as Tristate | null,
    strollerFriendly: text(f.strollerFriendly) as Tristate | null,
    foodAvailable: text(f.foodAvailable) as Tristate | null,
    toilets: text(f.toilets) as Tristate | null,
    notes: text(f.notes),
  };
}

export function PlaceForm({ id }: { id?: string }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    api.place(id)
      .then((d) => setForm(fromPlace(d.place)))
      .catch((err) => setError(err instanceof Error ? err.message : 'could not load this place'))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = toBody(form);
      const { place } = id ? await api.updatePlace(id, body) : await api.createPlace(body);
      navigate(`/places/${place.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonCard lines={3} />;

  return (
    <form className={css.form} onSubmit={submit}>
      <h1 className={css.title}>{id ? 'Edit place' : 'Add place'}</h1>

      {error && <p className={ui.error}>{error}</p>}

      {/* Only these three are required; everything else can wait. */}
      <div className={css.required}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Name</span>
          <input
            className={ui.input}
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder='Anpanman Museum'
            required
          />
        </label>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Indoor or outdoor</span>
          <select
            className={ui.select}
            value={form.environment}
            onChange={(e) => set('environment')(e.target.value as PlaceEnvironment)}
          >
            <option value='indoor'>Indoor</option>
            <option value='outdoor'>Outdoor</option>
            <option value='mixed'>Mixed</option>
          </select>
        </label>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Google Maps link</span>
          <input
            className={ui.input}
            type='url'
            inputMode='url'
            placeholder='https://maps.app.goo.gl/…'
            value={form.googleMapsUrl}
            onChange={(e) => set('googleMapsUrl')(e.target.value)}
          />
        </label>
      </div>

      <p className={css.hint}>That is enough to save. The rest can be filled in later.</p>

      <Section title='Travel and time'>
        <div className={ui.grid2}>
          <NumberField label='Drive (min)' value={form.driveMinutes} onChange={set('driveMinutes')} />
          <NumberField label='Train (min)' value={form.trainMinutes} onChange={set('trainMinutes')} />
          <NumberField
            label='Typical visit (min)'
            value={form.typicalDurationMinutes}
            onChange={set('typicalDurationMinutes')}
          />
          <NumberField
            label='Cooldown (days)'
            value={form.preferredCooldownDays}
            onChange={set('preferredCooldownDays')}
          />
        </div>
      </Section>

      <Section title='Weather suitability'>
        <TriField label='Good in rain' value={form.goodForRain} onChange={set('goodForRain')} />
        <TriField label='Good in heat' value={form.goodForHotWeather} onChange={set('goodForHotWeather')} />
        <TriField label='Good in cold' value={form.goodForColdWeather} onChange={set('goodForColdWeather')} />
        <TriField label='Fine when windy' value={form.goodForWind} onChange={set('goodForWind')} />
        <TriField label='Shaded' value={form.shaded} onChange={set('shaded')} />
      </Section>

      <Section title='Practical details'>
        <SelectField label='Parking' value={form.parking} onChange={set('parking')} options={TRISTATE_OPTIONS} />
        <SelectField
          label='Stroller friendly'
          value={form.strollerFriendly}
          onChange={set('strollerFriendly')}
          options={TRISTATE_OPTIONS}
        />
        <SelectField
          label='Food available'
          value={form.foodAvailable}
          onChange={set('foodAvailable')}
          options={TRISTATE_OPTIONS}
        />
        <SelectField label='Toilets' value={form.toilets} onChange={set('toilets')} options={TRISTATE_OPTIONS} />
        <SelectField
          label='Cost'
          value={form.costLevel}
          onChange={set('costLevel')}
          options={[['free', 'Free'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]}
        />
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Address</span>
          <input className={ui.input} value={form.address} onChange={(e) => set('address')(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Website</span>
          <input
            className={ui.input}
            type='url'
            value={form.websiteUrl}
            onChange={(e) => set('websiteUrl')(e.target.value)}
          />
        </label>
      </Section>

      <Section title='Our opinions'>
        <SelectField
          label='Priority'
          value={form.priority}
          onChange={set('priority')}
          options={[['1', 'Normal'], ['2', 'We like it'], ['3', 'Favourite'], ['4', 'Big favourite'], [
            '5',
            'Top of the list',
          ]]}
          allowEmpty={false}
        />
        <SelectField
          label='Status'
          value={form.status}
          onChange={(v) => set('status')(v as PlaceStatus)}
          options={[['active', 'Active'], ['want_to_go', 'Want to go'], ['archived', 'Archived']]}
          allowEmpty={false}
        />
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Categories (comma separated)</span>
          <input
            className={ui.input}
            placeholder='park, playground'
            value={form.categories}
            onChange={(e) => set('categories')(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Notes</span>
          <textarea
            className={ui.textarea}
            placeholder='Best in the morning. Bring a change of clothes.'
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </label>
      </Section>

      <div className={css.saveBar}>
        <div className={css.saveInner}>
          <button
            type='button'
            className={css.cancel}
            onClick={() => navigate(id ? `/places/${id}` : '/places')}
          >
            Cancel
          </button>
          <button className={css.save} type='submit' disabled={busy || !form.name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}

const TRISTATE_OPTIONS: [string, string][] = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className={css.section}>
      <summary className={css.summary}>
        {title}
        <ChevronDown size={20} className={css.chevron} />
      </summary>
      <div className={css.sectionBody}>{children}</div>
    </details>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={ui.field}>
      <span className={ui.fieldLabel}>{label}</span>
      <input
        className={ui.input}
        type='number'
        inputMode='numeric'
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TriField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <SelectField label={label} value={value} onChange={onChange} options={[['true', 'Yes'], ['false', 'No']]} />;
}

function SelectField(
  { label, value, onChange, options, allowEmpty = true }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: [string, string][];
    allowEmpty?: boolean;
  },
) {
  return (
    <label className={ui.field}>
      <span className={ui.fieldLabel}>{label}</span>
      <select className={ui.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value=''>Not set</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
