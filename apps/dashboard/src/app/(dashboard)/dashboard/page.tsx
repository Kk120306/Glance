'use client'

import { useState, useMemo } from 'react'
import { useSession } from '@/lib/auth-client'
import { useDashboard } from '@/components/DashboardProvider'
import { StatCard } from '@/components/StatCard'
import { SOSBanner } from '@/components/SOSBanner'
import { PatientCard } from '@/components/PatientCard'
import { AddPatientModal } from '@/components/AddPatientModal'

export default function DashboardOverviewPage() {
  const { data: session } = useSession()
  const { patients, patientsLoading, onlineStatus, sosAlert, setSosAlert, refreshPatients } = useDashboard()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'needs-attention'>('all')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  // Caregiver display name
  const caregiverName = useMemo(() => {
    if (!session?.user) return 'Caregiver'
    return session.user.name?.split(' ')[0] ?? session.user.email?.split('@')[0] ?? 'Caregiver'
  }, [session])

  // Count online patients
  const onlineCount = useMemo(() => {
    return patients.filter((p) => onlineStatus[p.id] === 'online').length
  }, [patients, onlineStatus])

  // SOS status checking
  const activeSosPatient = useMemo(() => {
    if (!sosAlert) return null
    return patients.find((p) => p.id === sosAlert.patientId) ?? null
  }, [sosAlert, patients])

  // Filtered patients list
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      // Apply search query
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
      
      // Apply attention filter (patient is in SOS)
      const matchesFilter = 
        filterMode === 'all' || 
        (filterMode === 'needs-attention' && sosAlert?.patientId === p.id)

      return matchesSearch && matchesFilter
    })
  }, [patients, searchQuery, filterMode, sosAlert])

  if (patientsLoading) {
    return (
      <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] flex flex-col justify-center items-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[4px] border-brand-primary border-t-transparent" />
          <p className="font-serif text-xl font-medium text-ink-muted">Loading your workspace...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      {/* Top Greeting Bar */}
      <div className="flex items-center justify-between mb-[22px]">
        <div>
          <h1 className="font-serif text-[34px] font-semibold tracking-tight text-ink">
            {greeting}, {caregiverName}
          </h1>
          <p className="text-[16px] text-ink-muted mt-0.5">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'} · {onlineCount} online · {sosAlert ? '1 needs attention' : 'all settled'}
          </p>
        </div>
        
        {/* Search and Add actions */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center bg-white border border-line rounded-[14px] px-[18px] py-3 text-[15px] font-bold text-ink-faint w-[240px] shadow-sm">
            <span className="mr-2">🔍</span>
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-ink placeholder-ink-faint font-bold focus:ring-0"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            title="Register or link a patient"
            className="w-[46px] h-[46px] bg-white border border-line rounded-[14px] flex items-center justify-center font-bold text-[20px] text-ink shadow-sm hover:bg-surface-warm active:bg-line transition-colors"
          >
            ＋
          </button>
        </div>
      </div>

      {/* Conditional SOS Alert Banner */}
      {activeSosPatient && (
        <SOSBanner
          patientName={activeSosPatient.name}
          roomInfo="Room 214"
          onRespond={() => setSosAlert(null)}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Messages today" value={37} />
        <StatCard label="Avg. gaze accuracy" value="94%" valueColor="#0B6F63" />
        <StatCard label="Help requests" value={5} />
        <StatCard label="Avg. response" value="1m 12s" />
      </div>

      {/* Section Header with filters */}
      <div className="flex items-center justify-between mb-[14px]">
        <h2 className="font-serif text-[24px] font-semibold text-ink">Your patients</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-full px-4 py-2 text-[14px] font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-white border border-line text-ink-muted shadow-sm'
                : 'text-ink-faint hover:text-ink-muted'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('needs-attention')}
            className={`rounded-full px-4 py-2 text-[14px] font-bold transition-all ${
              filterMode === 'needs-attention'
                ? 'bg-[#FDECEC] border border-[#F3B7B7] text-[#C62A2F] shadow-sm'
                : 'text-ink-faint hover:text-ink-muted'
            }`}
          >
            Needs attention
          </button>
        </div>
      </div>

      {/* Patients grid or empty state */}
      {filteredPatients.length === 0 ? (
        <div className="bg-white border border-line rounded-[20px] p-12 text-center shadow-soft">
          <span className="text-[48px] block mb-4">👥</span>
          <h3 className="font-serif text-2xl font-bold text-ink mb-2">No patients found</h3>
          <p className="text-ink-muted max-w-md mx-auto mb-6">
            {searchQuery || filterMode === 'needs-attention'
              ? 'Try modifying your search query or filters to find your patient.'
              : 'Register or link a patient to start managing messages, schedules, and gaze monitoring.'}
          </p>
          {!searchQuery && filterMode === 'all' && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="bg-brand-primary hover:bg-brand-deep text-white font-bold px-6 py-3 rounded-[14px] transition-colors"
            >
              Add your first patient
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredPatients.map((patient, index) => {
            const isOnline = onlineStatus[patient.id] === 'online'
            const isSOS = sosAlert?.patientId === patient.id

            // Alternate mock attributes to match mock design
            const gazeOptions = ['97%', 'Calibration low', '91%', '95%']
            const inputOptions = ['Dwell', 'Blink scan', 'Dwell', 'Dwell']
            const lastActiveOptions = ['2m ago', 'Now', '11m ago', '40m ago']

            return (
              <PatientCard
                key={patient.id}
                id={patient.id}
                name={patient.name}
                isOnline={isOnline}
                isSOS={isSOS}
                gazeStatus={isSOS ? 'Calibration low' : gazeOptions[index % gazeOptions.length]}
                inputMode={inputOptions[index % inputOptions.length]}
                lastActive={isSOS ? 'Now' : lastActiveOptions[index % lastActiveOptions.length]}
                roomInfo={`Room ${200 + index * 5}`}
                age={60 + (index * 7) % 25}
                latestMessage={isSOS ? '“I need help now”' : undefined}
                latestMessageTime={isSOS ? '8s ago' : undefined}
              />
            )
          })}
        </div>
      )}

      {/* Add Patient Modal */}
      <AddPatientModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={() => {
          void refreshPatients()
        }}
      />
    </main>
  )
}
