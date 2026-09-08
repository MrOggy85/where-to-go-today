import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { ChevronDown, Close, Plus } from '../icons.tsx';
import type { Category, CostLevel, Place, PlaceEnvironment, PlaceStatus, Tristate } from '../types.ts';
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
  /** Category ids. Chosen from the household's list; new ones are created before saving. */
  categoryIds: string[];
  driveMinutes: string;
  trainMinutes: string;
  typicalDurationHours: string;
  costLevel: string;
  priority: string;
  goodForRain: string;
  goodForHotWeather: string;
  goodForColdWeather: string;
  goodForWind: string;
  shaded: string;
  parking: string;
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
  categoryIds: [],
  driveMinutes: '',
  trainMinutes: '',
  typicalDurationHours: '',
  costLevel: '',
  priority: '1',
  goodForRain: '',
  goodForHotWeather: '',
  goodForColdWeather: '',
  goodForWind: '',
  shaded: '',
  parking: '',
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
    categoryIds: p.categories.map((c) => c.id),
    driveMinutes: num(p.driveMinutes),
    trainMinutes: num(p.trainMinutes),
    typicalDurationHours: num(p.typicalDurationHours),
    costLevel: p.costLevel ?? '',
    priority: String(p.priority),
    goodForRain: bool(p.goodForRain),
    goodForHotWeather: bool(p.goodForHotWeather),
    goodForColdWeather: bool(p.goodForColdWeather),
    goodForWind: bool(p.goodForWind),
    shaded: bool(p.shaded),
    parking: p.parking ?? '',
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
    categoryIds: f.categoryIds,
    driveMinutes: num(f.driveMinutes),
    trainMinutes: num(f.trainMinutes),
    typicalDurationHours: num(f.typicalDurationHours),
    costLevel: text(f.costLevel) as CostLevel | null,
    priority: Number(f.priority) || 1,
    goodForRain: bool(f.goodForRain),
    goodForHotWeather: bool(f.goodForHotWeather),
    goodForColdWeather: bool(f.goodForColdWeather),
    goodForWind: bool(f.goodForWind),
    shaded: bool(f.shaded),
    parking: text(f.parking) as Tristate | null,
    foodAvailable: text(f.foodAvailable) as Tristate | null,
    toilets: text(f.toilets) as Tristate | null,
    notes: text(f.notes),
  };
}

export function PlaceForm({ id }: { id?: string }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
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

  // The picker offers the household's categories, so the field is a closed list.
  useEffect(() => {
    api.categories().then((d) => setCategories(d.categories)).catch(() => setCategories([]));
  }, []);

  /** Creating from the form returns the new id straight into the selection. */
  async function addCategory(name: string) {
    const { category } = await api.createCategory(name);
    setCategories((list) => [...list, category].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((f) => ({ ...f, categoryIds: [...f.categoryIds, category.id] }));
  }

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
            label='Typical visit (hours)'
            value={form.typicalDurationHours}
            onChange={set('typicalDurationHours')}
            step={0.5}
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
          options={[['active', 'Active'], ['archived', 'Archived']]}
          allowEmpty={false}
        />
        <CategoryPicker
          all={categories}
          selected={form.categoryIds}
          onChange={set('categoryIds')}
          onCreate={addCategory}
        />
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

const NEW_CATEGORY = '__new__';

/**
 * Selected categories read as removable chips; the select adds one more from what is left.
 * A select rather than free text is the point: the same category cannot be spelled two ways.
 */
function CategoryPicker(
  { all, selected, onChange, onCreate }: {
    all: Category[];
    selected: string[];
    onChange: (ids: string[]) => void;
    onCreate: (name: string) => Promise<void>;
  },
) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chosen = selected.map((id) => all.find((c) => c.id === id)).filter((c): c is Category => !!c);
  const available = all.filter((c) => !selected.includes(c.id));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    try {
      await onCreate(trimmed);
      setName('');
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not add that category');
    }
  }

  return (
    <div className={ui.field}>
      <span className={ui.fieldLabel}>Categories</span>

      {chosen.length > 0 && (
        <div className={css.categoryChips}>
          {chosen.map((c) => (
            <span key={c.id} className={css.categoryChip}>
              {c.name}
              <button
                type='button'
                className={css.categoryRemove}
                aria-label={`Remove ${c.name}`}
                onClick={() => onChange(selected.filter((id) => id !== c.id))}
              >
                <Close size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {creating
        ? (
          <div className={css.categoryNew}>
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Category name'
              aria-label='New category name'
              maxLength={40}
              autoFocus
              // Enter would otherwise submit the place form instead of adding the category.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create();
                }
                if (e.key === 'Escape') setCreating(false);
              }}
            />
            <button type='button' className={css.categoryAdd} onClick={create} disabled={!name.trim()}>
              <Plus size={18} />
              Add
            </button>
          </div>
        )
        : (
          <select
            className={ui.select}
            value=''
            aria-label='Add a category'
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              if (value === NEW_CATEGORY) setCreating(true);
              else onChange([...selected, value]);
            }}
          >
            <option value=''>{available.length ? 'Add a category…' : 'All categories added'}</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
        )}

      {error && <p className={ui.error}>{error}</p>}
    </div>
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

/** `step` below 1 also switches the keypad to decimal, so a half hour can actually be typed. */
function NumberField(
  { label, value, onChange, step = 1 }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    step?: number;
  },
) {
  return (
    <label className={ui.field}>
      <span className={ui.fieldLabel}>{label}</span>
      <input
        className={ui.input}
        type='number'
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={0}
        step={step}
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
