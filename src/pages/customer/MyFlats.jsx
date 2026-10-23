import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { linkFlat, unlinkFlat } from '../../lib/api';
import { RELATIONS } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import FlatPicker from '../../components/FlatPicker';
import { Empty, ErrorBox, Field, FlatPlate, Loading, Modal, useToast } from '../../components/UI';

export default function MyFlats() {
  const { profile } = useAuth();
  const { myFlats, reloadFlats } = useOutletContext();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [flat, setFlat] = useState({ flatId: '' });
  const [relation, setRelation] = useState('owner');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!flat.flatId) return setError('Select a flat.');
    setBusy(true); setError('');
    try {
      await linkFlat(profile.id, flat.flatId, relation);
      await reloadFlats();
      toast('Flat added. The office will verify it.');
      setAdding(false);
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  }
  async function remove(cf) {
    if (!window.confirm('Remove this flat from your account?')) return;
    try { await unlinkFlat(cf.id); await reloadFlats(); toast('Flat removed'); } catch (e) { toast(errMsg(e), 'error'); }
  }

  if (myFlats === null) return <Loading />;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div><h1>My flats</h1><p>Flats and units linked to your account.</p></div>
        <button className="btn" onClick={() => { setAdding(true); setFlat({ flatId: '' }); }}>Add a flat</button>
      </div>
      <div className="panel list">
        {myFlats.length === 0 && <Empty title="No flat linked yet">Add the flat you own or rent so you can raise complaints.</Empty>}
        {myFlats.map((cf) => {
          const p = cf.flat.wing.tower.project;
          return (
            <div key={cf.id} className="list-item spread">
              <div className="row">
                <FlatPlate tower={cf.flat.wing.tower.name} wing={cf.flat.wing.name} flat={cf.flat.flat_no} lg />
                <div>
                  <div className="strong">{p.name}</div>
                  <div className="small muted">{RELATIONS.find((r) => r.value === cf.relation)?.label}{cf.flat.flat_type ? ` · ${cf.flat.flat_type}` : ''}</div>
                </div>
              </div>
              <div className="row">
                {cf.verified ? <span className="badge ok-tag">Verified</span> : <span className="badge warn-tag">Awaiting verification</span>}
                {!cf.verified && <button className="btn ghost sm" onClick={() => remove(cf)}>Remove</button>}
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <Modal title="Add a flat" onClose={() => setAdding(false)}
          footer={<><button className="btn secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add flat'}</button></>}>
          <ErrorBox error={error} />
          <FlatPicker onChange={setFlat} />
          <Field label="You are the">
            <select className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  );
}
