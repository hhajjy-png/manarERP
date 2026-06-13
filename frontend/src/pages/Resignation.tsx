import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ResignationTemplate from '../forms/ResignationTemplate';

export default function Resignation() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('resignation'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/resignation/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'resignation',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, printMode]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="طلب استقالة"
      printMode={printMode}
      qrData={{
        formType: 'resignation',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <ResignationTemplate employee={data.employee} />
    </FormLayout>
  );
}
