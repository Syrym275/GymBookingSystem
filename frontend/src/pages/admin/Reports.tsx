import { useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { defaultReportRange } from '../../api/adminApi';
import { popularHours, popularTrainers, unpaidMembers, type TrainerReportRow, type UnpaidGroup } from '../../api/reportsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { MAX_PENDING } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import { useChartColors } from '../../theme/ThemeContext';
import { bkNumber, kzt } from '../../utils/format';
import { downloadCsv } from './common';

const tooltipStyle = {
  background: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--line))',
  borderRadius: 8,
  color: 'rgb(var(--ink))',
  fontSize: 12,
};

/** Three reports: popular trainers, popular start hours, members with unpaid bookings. */
export default function AdminReports() {
  const { t } = useT();
  const colors = useChartColors();
  const initial = defaultReportRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const trainers = useAsync(() => popularTrainers(from, to), [from, to]);
  const hours = useAsync(() => popularHours(from, to), [from, to]);
  const unpaid = useAsync(unpaidMembers, []);
  const axis = { fill: colors.axis, fontSize: 11 };

  const trainerCols: Column<TrainerReportRow>[] = [
    { key: 'name', header: t('adm.tr.trainer'), sort: (r) => r.trainer_name, render: (r) => <b>{r.trainer_name}</b> },
    { key: 'sessions', header: t('adm.rp.sessions'), sort: (r) => r.sessions, render: (r) => r.sessions },
    { key: 'eve', header: t('adm.rp.evening'), sort: (r) => r.evening, render: (r) => r.evening },
    { key: 'day', header: t('adm.rp.before17'), sort: (r) => r.before_17, render: (r) => r.before_17 },
    { key: 'ns', header: t('stats.noShows'), sort: (r) => r.no_shows, render: (r) => r.no_shows },
  ];

  const unpaidCols: Column<UnpaidGroup>[] = [
    { key: 'name', header: t('adm.bk.member'), sort: (g) => g.full_name, render: (g) => <b>{g.full_name}</b> },
    { key: 'phone', header: t('adm.bk.phone'), render: (g) => g.phone },
    {
      key: 'n',
      header: t('adm.rp.unpaid'),
      sort: (g) => g.bookings.length,
      render: (g) => (
        <span className={g.bookings.length >= MAX_PENDING ? 'font-bold text-berry' : ''}>
          {g.bookings.length} / {MAX_PENDING}
        </span>
      ),
    },
    { key: 'bk', header: t('adm.rp.bookings'), render: (g) => g.bookings.map((b) => bkNumber(b.booking_id)).join(', ') },
    {
      key: 'sum',
      header: t('adm.rp.due'),
      sort: (g) => g.bookings.reduce((s, b) => s + b.price_kzt, 0),
      render: (g) => kzt(g.bookings.reduce((s, b) => s + b.price_kzt, 0)),
    },
  ];

  const exportTrainers = () =>
    downloadCsv(
      'popular-trainers.csv',
      ['Trainer', 'Sessions held', 'Evening (17:00+)', 'Before 17:00', 'No-shows'],
      (trainers.data ?? []).map((r) => [r.trainer_name, r.sessions, r.evening, r.before_17, r.no_shows]),
    );

  return (
    <div className="space-y-8">
      <PageHeader title={t('adm.nav.reports')} subtitle={t('adm.rp.sub')} />

      <div className="card-flat flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="r-from">
            {t('adm.from')}
          </label>
          <input id="r-from" type="date" className="input" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-to">
            {t('adm.to')}
          </label>
          <input id="r-to" type="date" className="input" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        <p className="pb-2 text-xs text-ink/60">{t('adm.rp.rangeNote')}</p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{t('adm.rp.h1')}</h2>
          <button className="btn-ghost btn-sm" onClick={exportTrainers} disabled={!trainers.data?.length}>
            <Download className="h-3 w-3" /> {t('history.export')}
          </button>
        </div>
        {trainers.error && <ErrorNote message={msg(trainers.error)} />}
        {!trainers.data && !trainers.error && <Loading />}
        {trainers.data && (
          <div className="grid gap-5 2xl:grid-cols-2">
            <div className="card min-w-0">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trainers.data}>
                    <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="trainer_name" tick={axis} />
                    <YAxis allowDecimals={false} tick={axis} />
                    <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="before_17" name={t('adm.rp.before17')} stackId="a" fill={colors.secondary} />
                    <Bar dataKey="evening" name={t('adm.rp.evening')} stackId="a" fill={colors.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <DataTable
              rows={trainers.data}
              columns={trainerCols}
              rowKey={(r) => r.trainer_id}
              initialSort={{ key: 'sessions', dir: 'desc' }}
              empty={<EmptyState title={t('adm.rp.none')} />}
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t('adm.rp.h2')}</h2>
        {hours.error && <ErrorNote message={msg(hours.error)} />}
        {!hours.data && !hours.error && <Loading />}
        {hours.data && (
          <div className="card min-w-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours.data}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name={t('adm.ov.bookings')} fill={colors.secondary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t('adm.rp.h3')}</h2>
        {unpaid.error && <ErrorNote message={msg(unpaid.error)} />}
        {!unpaid.data && !unpaid.error && <Loading />}
        {unpaid.data && <DataTable rows={unpaid.data} columns={unpaidCols} rowKey={(g) => g.member_id} empty={<EmptyState title={t('adm.rp.nobodyOwes')} />} />}
      </section>
    </div>
  );
}
