import { useEffect, useMemo, useState } from 'react';
import FloatingWidget from './FloatingWidget';

export type PrintFormChoice = {
  id: string;
  label: string;
  hint?: string;
  isDefault?: boolean;
};

export type PrintJobResult = {
  formId: string;
  destination: 'pdf' | 'printer';
  deviceName?: string;
  copies: number;
};

type PrinterRow = {
  name: string;
  displayName: string;
  isDefault?: boolean;
};

type Props = {
  open: boolean;
  title: string;
  forms: PrintFormChoice[];
  defaultFormId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (job: PrintJobResult) => void | Promise<void>;
};

export default function PrintJobDialog({
  open,
  title,
  forms,
  defaultFormId,
  busy = false,
  onClose,
  onSubmit,
}: Props) {
  const [formId, setFormId] = useState(defaultFormId || forms[0]?.id || '');
  const [destination, setDestination] = useState<'printer' | 'pdf'>('printer');
  const [deviceName, setDeviceName] = useState('');
  const [copies, setCopies] = useState(1);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printersError, setPrintersError] = useState('');
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  useEffect(() => {
    if (!open) return;
    const preferred = defaultFormId || forms.find((f) => f.isDefault)?.id || forms[0]?.id || '';
    setFormId(preferred);
    setCopies(1);
    setPrintersError('');
    let cancelled = false;
    (async () => {
      setLoadingPrinters(true);
      try {
        const rows = (await (window as any).api.listPrinters?.()) || [];
        if (cancelled) return;
        setPrinters(rows);
        const def = rows.find((p: PrinterRow) => p.isDefault) || rows[0];
        if (def) {
          setDeviceName(def.name);
          setDestination('printer');
        } else {
          setDeviceName('');
          setDestination('pdf');
        }
      } catch (e: any) {
        if (!cancelled) {
          setPrinters([]);
          setDeviceName('');
          setDestination('pdf');
          setPrintersError(e?.message || 'Не удалось получить список принтеров');
        }
      } finally {
        if (!cancelled) setLoadingPrinters(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, defaultFormId, forms]);

  const selectedForm = useMemo(() => forms.find((f) => f.id === formId), [forms, formId]);
  const canSubmit = Boolean(formId) && (destination === 'pdf' || Boolean(deviceName)) && !busy;

  if (!open) return null;

  return (
    <FloatingWidget title={title} open onClose={onClose} width={520} zIndex={1790}>
      <p className="subtext" style={{ marginTop: 0 }}>
        Выберите печатную форму и куда отправить документ — на принтер или сохранить PDF.
      </p>

      <div className="form-grid" style={{ marginTop: 8 }}>
        <label className="field-wide">Форма печати
          <select value={formId} onChange={(e) => setFormId(e.target.value)} disabled={!forms.length || busy}>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}{f.isDefault ? ' · по умолчанию' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field-wide">Назначение
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as 'printer' | 'pdf')}
            disabled={busy}
          >
            <option value="printer" disabled={!printers.length}>Принтер</option>
            <option value="pdf">Файл PDF</option>
          </select>
        </label>

        {destination === 'printer' && (
          <>
            <label className="field-wide">Принтер
              <select
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={busy || loadingPrinters || !printers.length}
              >
                {!printers.length && <option value="">Нет доступных принтеров</option>}
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}{p.isDefault ? ' · по умолчанию' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Копий
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                disabled={busy}
                onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              />
            </label>
          </>
        )}
      </div>

      {selectedForm?.hint && <p className="subtext">{selectedForm.hint}</p>}
      {printersError && <div className="form-error">{printersError}</div>}
      {destination === 'pdf' && (
        <p className="subtext">Откроется диалог сохранения файла. «Microsoft Print to PDF» также можно выбрать как принтер, если он установлен в системе.</p>
      )}

      <div className="modal-actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-text" onClick={onClose} disabled={busy}>Отмена</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={() => void onSubmit({
            formId,
            destination,
            deviceName: destination === 'printer' ? deviceName : undefined,
            copies: destination === 'printer' ? copies : 1,
          })}
        >
          {busy ? 'Печать…' : destination === 'pdf' ? 'Сохранить PDF' : 'Печать'}
        </button>
      </div>
    </FloatingWidget>
  );
}
