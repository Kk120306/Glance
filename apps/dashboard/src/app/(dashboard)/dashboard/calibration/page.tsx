'use client'

import Link from 'next/link'

export default function CalibrationPage() {
  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-serif text-[34px] font-semibold tracking-tight text-ink">Calibration</h1>
        <p className="text-[16px] text-ink-muted mt-0.5">How gaze and blink tracking is tuned for your loved one.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-[22px] border border-line bg-white p-6 shadow-soft max-w-2xl">
        <p className="text-[15px] text-ink-muted">
          Calibration runs <span className="font-bold text-ink">on the patient device</span>, not from this
          dashboard — it measures eye-aspect ratio and gaze direction live from the camera and saves a per-device
          profile automatically.
        </p>
        <ol className="flex flex-col gap-3">
          {[
            'Open the patient screen on their device using “View screen” from a patient card.',
            'The calibration wizard runs once at startup — it waits for a face, samples a few blinks, and saves the profile. No input is needed.',
            'To re-run it, open the gaze tracking panel on the patient screen and choose “Calibrate”.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand-deep">
                {i + 1}
              </span>
              <span className="text-[15px] text-ink-muted">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-[15px] text-ink-muted">
          Open a patient from{' '}
          <Link href="/dashboard" className="font-bold text-brand-deep hover:underline">
            Patients
          </Link>{' '}
          and use “View screen” to reach their device.
        </p>
      </section>
    </main>
  )
}
