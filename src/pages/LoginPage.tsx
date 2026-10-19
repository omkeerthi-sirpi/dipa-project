import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, ClipboardCheck, FileCheck2, FlaskConical, HardHat, ShieldCheck, UserCog } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/primitives';
import { useLogin, useSession } from '@/hooks/queries';
import { FullScreenLoader } from '@/routes/guards';
import { loginSchema, type LoginValues } from '@/schemas';
import { errorMessage } from '@/services/apiError';

const DEMO = [
  { role: 'Discipline Engineer', email: 'discipline.engineer@meridian-energy.example', name: 'Priya Raman', title: 'Mechanical', icon: HardHat, blurb: 'Upload workbooks, run guided validation, complete manual testing and submit for approval.' },
  { role: 'Responsible Engineer', email: 'responsible.engineer@meridian-energy.example', name: 'Elena Vasquez', title: 'Technical Assurance', icon: UserCog, blurb: 'Review submissions, approve or request changes and authorise vendor handover.' },
];

function safeRedirect(target: string | null) {
  // Only allow same-origin relative paths (prevents open redirects).
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard';
}

export default function LoginPage() {
  const { data: session, isLoading } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  if (isLoading) return <FullScreenLoader />;
  if (session) return <Navigate to={redirect} replace />;

  const submit = (v: LoginValues) =>
    login.mutate(v, {
      onSuccess: () => navigate(redirect, { replace: true }),
      onError: (e) => form.setError('root', { message: errorMessage(e) }),
    });

  const quick = (email: string) => {
    form.setValue('email', email);
    form.setValue('password', 'demo');
    form.handleSubmit(submit)();
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <FileCheck2 className="size-6 text-accent" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-wide">DIPA</p>
            <p className="text-xs uppercase tracking-[0.14em] text-navy-300">Document Integrity &amp; Process Approval</p>
          </div>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-3xl font-semibold leading-tight">Validated engineering data, before it reaches your vendors.</h1>
          <p className="mt-4 text-sm leading-relaxed text-navy-200">
            Check equipment data sheets, pipeline inspection data and instrument indices against controlled requirement specifications, then route them through manual verification and
            Responsible Engineer approval with a complete audit trail.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-100">
            {[
              [ShieldCheck, 'Deterministic rule checks traceable to requirement, rule, sheet, row and field'],
              [ClipboardCheck, 'Mandatory manual verification and segregation of duties'],
              [FileCheck2, 'Version-locked approvals and vendor transmittals'],
            ].map(([Icon, text], i) => (
              <li key={i} className="flex items-center gap-3">
                <Icon className="size-4 text-accent" />
                {text as string}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-[11px] text-navy-400">Fictional organisation “Meridian Energy” · synthetic data only</p>
      </section>

      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <FlaskConical className="size-4 shrink-0" />
            <span>
              <strong>Prototype — mock authentication.</strong> Not a production sign-in. Demo accounts accept any password.
            </span>
          </div>
          <h2 className="text-xl font-semibold text-navy-950">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Choose a demo persona or sign in with a demo email.</p>

          <div className="mt-6 grid grid-cols-1 gap-3">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                disabled={login.isPending}
                onClick={() => quick(d.email)}
                className="group flex w-full cursor-pointer items-start gap-4 rounded-lg border border-border bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:border-navy-300 hover:shadow-md disabled:opacity-60"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700 group-hover:bg-navy-900 group-hover:text-white">
                  <d.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{d.role}</span>
                    <ArrowRight className="size-4 text-slate-300 group-hover:text-accent" />
                  </span>
                  <span className="block text-xs text-slate-600">
                    {d.name} · {d.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{d.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" autoComplete="username" placeholder="discipline.engineer@meridian-energy.example" aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
              <FieldError message={form.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
              <FieldError message={form.formState.errors.password?.message} />
            </div>
            {form.formState.errors.root && (
              <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">
                {form.formState.errors.root.message}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
            Production deployments must use the organisation's identity provider (SSO / OIDC) with server-managed HttpOnly session cookies.
          </p>
        </div>
      </section>
    </div>
  );
}
