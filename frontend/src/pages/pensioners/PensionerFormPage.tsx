import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import api from '../../config/api';
import { Input, Select, Button, CurrencyInput, PageHeader, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';

const STEPS = ['Personal Details', 'Employment', 'Pension & Gratuity', 'Bank Account', 'Next of Kin'];

export default function PensionerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc = useQueryClient();
  const isEdit = Boolean(id && id !== 'new');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({
    employmentType: 'permanent',
    gender: 'male',
    monthlyPension: 0,
    totalGratuityDue: 0,
    accountType: 'savings',
  });

  // Load existing data when editing
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['pensioner', id],
    queryFn: () => api.get(`/pensioners/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        pensionNo:               existing.pension_no,
        employeeNo:              existing.employee_no,
        title:                   existing.title || '',
        firstName:               existing.first_name,
        middleName:              existing.middle_name || '',
        lastName:                existing.last_name,
        gender:                  existing.gender,
        dateOfBirth:             existing.date_of_birth?.slice(0, 10) || '',
        nationalId:              existing.national_id || '',
        passportNo:              existing.passport_no || '',
        maritalStatus:           existing.marital_status || '',
        phonePrimary:            existing.phone_primary || '',
        phoneSecondary:          existing.phone_secondary || '',
        email:                   existing.email || '',
        postalAddress:           existing.postal_address || '',
        physicalAddress:         existing.physical_address || '',
        nextOfKinName:           existing.next_of_kin_name || '',
        nextOfKinRelation:       existing.next_of_kin_relation || '',
        nextOfKinPhone:          existing.next_of_kin_phone || '',
        nextOfKinAddress:        existing.next_of_kin_address || '',
        // Department and designation stored as free text
        departmentText:            existing.department_name || '',
        designationAtRetirement:   existing.designation_at_retirement || existing.designation_name || '',
        gradeAtRetirement:         existing.grade_at_retirement || existing.grade || '',
        gradeAtFirstAppointment:   existing.grade_at_first_appointment || '',
        employmentType:            existing.employment_type || 'permanent',
        dateOfFirstAppointment:  existing.date_of_first_appointment?.slice(0, 10) || '',
        dateOfRetirement:        existing.date_of_retirement?.slice(0, 10) || '',
        yearsOfService:          existing.years_of_service || '',
        reasonForExit:           existing.reason_for_exit || '',
        monthlyPension:          parseFloat(existing.monthly_pension) || 0,
        totalGratuityDue:              parseFloat(existing.total_gratuity_due) || 0,
        hasPreRetirementGratuity:      parseFloat(existing.pre_retirement_gratuity_paid) > 0,
        preRetirementGratuityPaid:     parseFloat(existing.pre_retirement_gratuity_paid) || 0,
        preRetirementGratuityReason:   existing.pre_retirement_gratuity_reason || '',
        pensionStartDate:        existing.pension_start_date?.slice(0, 10) || '',
        notes:                   existing.notes || '',
      });
    }
  }, [existing]);

  // Department and designation are free-text fields — no dropdown queries needed

  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      isEdit ? api.put(`/pensioners/${id}`, data) : api.post('/pensioners', data),
    onSuccess: (res) => {
      toast.success(isEdit ? 'Pensioner updated successfully!' : 'Pensioner registered successfully!');
      qc.invalidateQueries({ queryKey: ['pensioner', id] });
      qc.invalidateQueries({ queryKey: ['pensioners'] });
      navigate(`/pensioners/${res.data.data.id}`);
    },
  });

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.firstName || !form.lastName) return toast.error('First and last name are required');
    if (!form.employeeNo) return toast.error('Employee number is required');
    if (!form.dateOfFirstAppointment) return toast.error('Date of first appointment is required');
    if (!form.dateOfBirth) return toast.error('Date of birth is required');

    mutation.mutate({
      pensionNo:               form.pensionNo || undefined,
      employeeNo:              form.employeeNo,
      title:                   form.title || undefined,
      firstName:               form.firstName,
      middleName:              form.middleName || undefined,
      lastName:                form.lastName,
      gender:                  form.gender,
      dateOfBirth:             form.dateOfBirth,
      nationalId:              form.nationalId || undefined,
      passportNo:              form.passportNo || undefined,
      maritalStatus:           form.maritalStatus || undefined,
      phonePrimary:            form.phonePrimary || undefined,
      phoneSecondary:          form.phoneSecondary || undefined,
      email:                   form.email || undefined,
      postalAddress:           form.postalAddress || undefined,
      physicalAddress:         form.physicalAddress || undefined,
      nextOfKinName:           form.nextOfKinName || undefined,
      nextOfKinRelation:       form.nextOfKinRelation || undefined,
      nextOfKinPhone:          form.nextOfKinPhone || undefined,
      nextOfKinAddress:        form.nextOfKinAddress || undefined,
      // Department and designation sent as free text — backend stores in the text columns
      departmentText:              form.departmentText           || undefined,
      designationAtRetirement:     form.designationAtRetirement  || undefined,
      gradeAtRetirement:           form.gradeAtRetirement        || undefined,
      gradeAtFirstAppointment:     form.gradeAtFirstAppointment  || undefined,
      employmentType:              form.employmentType,
      dateOfFirstAppointment:  form.dateOfFirstAppointment,
      dateOfRetirement:        form.dateOfRetirement || undefined,
      yearsOfService:          parseFloat(form.yearsOfService) || undefined,
      reasonForExit:           form.reasonForExit || undefined,
      monthlyPension:          Number(form.monthlyPension),
      totalGratuityDue:              Number(form.totalGratuityDue),
      preRetirementGratuityPaid:    Number(form.preRetirementGratuityPaid || 0),
      preRetirementGratuityReason:  form.preRetirementGratuityReason || undefined,
      pensionStartDate:        form.pensionStartDate || undefined,
      notes:                   form.notes || undefined,
    });
  }

  if (isEdit && loadingExisting) return <Spinner />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Pensioner Record' : 'Register New Pensioner'}
        subtitle={isEdit ? `Editing: ${existing?.first_name || ''} ${existing?.last_name || ''}` : 'Complete all steps to register a new pensioner'}
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setStep(i)}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                i < step ? 'bg-navy text-white' : i === step ? 'bg-gold text-navy' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {i < step ? <Check size={12} /> : i + 1}
            </button>
            <span className={`text-xs hidden sm:block ${i === step ? 'font-semibold text-navy' : 'text-slate-400'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? 'bg-navy' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-display text-lg text-navy mb-5">{STEPS[step]}</h2>

        {/* Step 0: Personal Details */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-4">
            <Select label="Title" options={[{value:'Mr',label:'Mr'},{value:'Mrs',label:'Mrs'},{value:'Ms',label:'Ms'},{value:'Dr',label:'Dr'},{value:'Prof',label:'Prof'}]} value={form.title||''} onChange={e => set('title', e.target.value)} placeholder="Select title" />
            <Select label="Gender *" options={[{value:'male',label:'Male'},{value:'female',label:'Female'},{value:'other',label:'Other'}]} value={form.gender||'male'} onChange={e => set('gender', e.target.value)} />
            <Input label="First Name *" value={form.firstName||''} onChange={e => set('firstName', e.target.value)} />
            <Input label="Middle Name" value={form.middleName||''} onChange={e => set('middleName', e.target.value)} />
            <Input label="Last Name *" value={form.lastName||''} onChange={e => set('lastName', e.target.value)} className="col-span-2" />
            <Input label="Date of Birth *" type="date" value={form.dateOfBirth||''} onChange={e => set('dateOfBirth', e.target.value)} />
            <Input label="National ID" value={form.nationalId||''} onChange={e => set('nationalId', e.target.value)} />
            <Input label="Phone (Primary)" value={form.phonePrimary||''} onChange={e => set('phonePrimary', e.target.value)} />
            <Input label="Phone (Secondary)" value={form.phoneSecondary||''} onChange={e => set('phoneSecondary', e.target.value)} />
            <Select label="Marital Status" options={[{value:'single',label:'Single'},{value:'married',label:'Married'},{value:'widowed',label:'Widowed'},{value:'divorced',label:'Divorced'}]} value={form.maritalStatus||''} onChange={e => set('maritalStatus', e.target.value)} placeholder="Select status" />
            <Input label="Email" type="email" value={form.email||''} onChange={e => set('email', e.target.value)} />
            <Input label="Physical Address" value={form.physicalAddress||''} onChange={e => set('physicalAddress', e.target.value)} className="col-span-2" />
            <Input label="Postal Address" value={form.postalAddress||''} onChange={e => set('postalAddress', e.target.value)} className="col-span-2" />
          </div>
        )}

        {/* Step 1: Employment */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <Input label="Pension Number" value={form.pensionNo||''} onChange={e => set('pensionNo', e.target.value)} hint="Leave blank to auto-generate" />
            )}
            {isEdit && (
              <div>
                <label className="label">Pension Number</label>
                <div className="input bg-slate-50 text-slate-500 cursor-not-allowed">{form.pensionNo}</div>
                <p className="text-xs text-slate-400 mt-1">Cannot be changed after registration</p>
              </div>
            )}
            <Input label="Employee Number *" value={form.employeeNo||''} onChange={e => set('employeeNo', e.target.value)} />
            <Input
              label="Department"
              value={form.departmentText||''}
              onChange={e => set('departmentText', e.target.value)}
              placeholder="e.g. Ministry of Finance"
            />
            <Input
              label="Designation at Retirement *"
              value={form.designationAtRetirement||''}
              onChange={e => set('designationAtRetirement', e.target.value)}
              placeholder="e.g. Principal Secretary"
              hint="Officer's final designation — their designation at retirement"
            />
            <Select label="Employment Type" options={[{value:'permanent',label:'Permanent'},{value:'contract',label:'Contract'},{value:'casual',label:'Casual'}]} value={form.employmentType||'permanent'} onChange={e => set('employmentType', e.target.value)} />
            <Input label="Date of First Appointment *" type="date" value={form.dateOfFirstAppointment||''} onChange={e => set('dateOfFirstAppointment', e.target.value)} />
            <Input label="Date of Retirement" type="date" value={form.dateOfRetirement||''} onChange={e => set('dateOfRetirement', e.target.value)} />
            <Input label="Years of Service" type="number" step="0.01" value={form.yearsOfService||''} onChange={e => set('yearsOfService', e.target.value)} hint="Informational only" />
            <Input label="Reason for Exit" value={form.reasonForExit||''} onChange={e => set('reasonForExit', e.target.value)} />
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Grades</p>
            </div>
            <Input label="Grade at Retirement" value={form.gradeAtRetirement||''} onChange={e => set('gradeAtRetirement', e.target.value)} placeholder="e.g. P1, P2" hint="Auto-filled from designation — override if different" />
            <Input label="Grade at First Appointment" value={form.gradeAtFirstAppointment||''} onChange={e => set('gradeAtFirstAppointment', e.target.value)} placeholder="e.g. P7, P6" />
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.deceasedOnEntry||false}
                  onChange={e => set('deceasedOnEntry', e.target.checked)} className="w-4 h-4 accent-navy" />
                <div>
                  <span className="text-sm font-medium text-slate-700">Deceased on Entry</span>
                  <p className="text-xs text-slate-400">Tick if this person is already deceased at the time of registration</p>
                </div>
              </label>
            </div>
            {form.deceasedOnEntry && (
              <Input label="Date of Death" type="date" value={form.dateOfDeath||''} onChange={e => set('dateOfDeath', e.target.value)} />
            )}
          </div>
        )}

        {/* Step 2: Pension & Gratuity — DIRECT ENTRY */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>Enter amounts exactly as stated in the official award letters.</strong>
              {isEdit && (
                <span className="block mt-1 text-blue-600">
                  ⚠️ Changes to these amounts are automatically logged in the adjustment history.
                </span>
              )}
            </div>
            <CurrencyInput
              label="Monthly Pension Amount (MWK) — from award letter"
              value={form.monthlyPension}
              onChange={v => set('monthlyPension', v)}
              required
              hint="This exact amount will be paid every month"
            />
            <CurrencyInput
              label="Total Gratuity Due (MWK) — from award letter"
              value={form.totalGratuityDue}
              onChange={v => set('totalGratuityDue', v)}
              hint="Total lump sum entitlement as per the gratuity award letter."
            />

            {/* Pre-retirement partial gratuity */}
            <div className="col-span-1 sm:col-span-1">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasPreRetirementGratuity||false}
                    onChange={e => {
                      set('hasPreRetirementGratuity', e.target.checked);
                      if (!e.target.checked) {
                        set('preRetirementGratuityPaid', 0);
                        set('preRetirementGratuityReason', '');
                      }
                    }}
                    className="w-4 h-4 accent-amber-600 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-semibold text-amber-800">
                      Received Partial Gratuity Before Retirement?
                    </span>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Tick if this officer received a partial gratuity payment before their retirement date.
                      The system will automatically deduct this from the outstanding balance.
                    </p>
                  </div>
                </label>
                {form.hasPreRetirementGratuity && (
                  <div className="space-y-3 pt-2 border-t border-amber-200">
                    <CurrencyInput
                      label="Amount Already Paid Before Retirement (MWK)"
                      value={form.preRetirementGratuityPaid||0}
                      onChange={v => set('preRetirementGratuityPaid', v)}
                      required
                      hint={form.totalGratuityDue > 0
                        ? `Remaining balance will be: ${new Intl.NumberFormat('en-MW',{style:'currency',currency:'MWK'}).format((form.totalGratuityDue||0)-(form.preRetirementGratuityPaid||0))}`
                        : 'Enter total gratuity due above first'}
                    />
                    <Input
                      label="Reason / Reference"
                      value={form.preRetirementGratuityReason||''}
                      onChange={e => set('preRetirementGratuityReason', e.target.value)}
                      placeholder="e.g. Pre-retirement partial payment, IFMIS ref..."
                    />
                  </div>
                )}
              </div>
            </div>

            <Input label="Pension Start Date" type="date" value={form.pensionStartDate||''} onChange={e => set('pensionStartDate', e.target.value)} />
            <Input label="Notes" value={form.notes||''} onChange={e => set('notes', e.target.value)} />
          </div>
        )}

        {/* Step 3: Bank Account (only on create) */}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-4">
            {isEdit ? (
              <div className="col-span-2 bg-slate-50 rounded-lg p-4 text-sm text-slate-500">
                Bank accounts are managed from the pensioner profile page. Go to the pensioner detail page to add or update bank accounts.
              </div>
            ) : (
              <>
                <Input label="Bank Name *" value={form.bankName||''} onChange={e => set('bankName', e.target.value)} />
                <Input label="Branch Name" value={form.branchName||''} onChange={e => set('branchName', e.target.value)} />
                <Input label="Account Number *" value={form.accountNumber||''} onChange={e => set('accountNumber', e.target.value)} className="col-span-2" />
                <Input label="Account Name *" value={form.accountName||''} onChange={e => set('accountName', e.target.value)} className="col-span-2" />
                <Select label="Account Type" options={[{value:'savings',label:'Savings'},{value:'current',label:'Current'},{value:'mobile_money',label:'Mobile Money'}]} value={form.accountType||'savings'} onChange={e => set('accountType', e.target.value)} />
                <Input label="Effective From" type="date" value={form.bankEffectiveFrom||''} onChange={e => set('bankEffectiveFrom', e.target.value)} />
              </>
            )}
          </div>
        )}

        {/* Step 4: Next of Kin */}
        {step === 4 && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" value={form.nextOfKinName||''} onChange={e => set('nextOfKinName', e.target.value)} className="col-span-2" />
            <Input label="Relationship" value={form.nextOfKinRelation||''} onChange={e => set('nextOfKinRelation', e.target.value)} placeholder="e.g. Spouse, Child, Sibling" />
            <Input label="Phone" value={form.nextOfKinPhone||''} onChange={e => set('nextOfKinPhone', e.target.value)} />
            <Input label="Address" value={form.nextOfKinAddress||''} onChange={e => set('nextOfKinAddress', e.target.value)} className="col-span-2" />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
          <Button variant="ghost" icon={<ChevronLeft size={14} />} onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button icon={<ChevronRight size={14} />} onClick={() => setStep(s => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={mutation.isPending} icon={<Check size={14} />}>
              {isEdit ? 'Save Changes' : 'Register Pensioner'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
