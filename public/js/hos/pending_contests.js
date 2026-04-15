// Uses allContests injected from the EJS template via server data
// allContests is a global variable set in pending_contests.ejs

let currentTab = 'pending';
let currentPage = 1;
const itemsPerPage = 10;

// ============================================
// CONFLICT DETECTION SYSTEM
// ============================================
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
}

function detectConflicts(contestId) {
    const contest = allContests.find(c => c.id === contestId);
    if (!contest || contest.status !== 'pending') return [];

    const conflicts = [];
    allContests.forEach(other => {
        if (other.id === contestId || other.status !== 'pending') return;

        if (contest.subject === other.subject &&
            contest.section === other.section &&
            contest.start_date === other.start_date) {

            const start1 = parseTime(contest.start_time);
            const end1 = parseTime(contest.end_time);
            const start2 = parseTime(other.start_time);
            const end2 = parseTime(other.end_time);

            if (start1 < end2 && end1 > start2) {
                conflicts.push({
                    contest: other,
                    type: 'time_overlap',
                    message: `Conflicts with "${other.title}" (${other.start_time}-${other.end_time})`
                });
            }
        }
    });
    return conflicts;
}

function hasConflict(contestId) {
    return detectConflicts(contestId).length > 0;
}

function getAllConflictingContests() {
    return allContests.filter(c => c.status === 'pending' && hasConflict(c.id));
}

// Theme Toggle
const themeToggleBtn = document.getElementById('themeToggleBtn');
const html = document.documentElement;

function applyTheme(theme) {
    if (theme === 'dark') {
        html.classList.add('dark');
        themeToggleBtn.querySelector('i').classList.replace('fa-moon', 'fa-sun');
    } else {
        html.classList.remove('dark');
        themeToggleBtn.querySelector('i').classList.replace('fa-sun', 'fa-moon');
    }
    localStorage.theme = theme;
}

themeToggleBtn.addEventListener('click', () => {
    applyTheme(html.classList.contains('dark') ? 'light' : 'dark');
});

const savedTheme = localStorage.theme || 'light';
applyTheme(savedTheme);

// Sidebar Toggle
const sidebar = document.getElementById('mainSidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const toggleIcon = sidebarToggleBtn.querySelector('i');
const sidebarLogoText = document.getElementById('sidebarLogoText');
const headerLogoText = document.getElementById('headerLogoText');

sidebarToggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.replace('w-64', 'w-20');
        toggleIcon.style.transform = 'rotate(180deg)';
        sidebarLogoText.style.opacity = '0';
        headerLogoText.classList.remove('hidden');
        setTimeout(() => headerLogoText.classList.remove('opacity-0', '-translate-x-2'), 50);
    } else {
        sidebar.classList.replace('w-20', 'w-64');
        toggleIcon.style.transform = 'rotate(0deg)';
        sidebarLogoText.style.opacity = '1';
        headerLogoText.classList.add('opacity-0', '-translate-x-2');
        setTimeout(() => headerLogoText.classList.add('hidden'), 300);
    }
});

// Tab Switching
const tabs = document.querySelectorAll('.approval-tab');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => {
            t.classList.remove('active', 'text-primary-600', 'dark:text-primary-400', 'border-primary-500');
            t.classList.add('text-gray-500', 'dark:text-gray-400');
        });
        tab.classList.add('active', 'text-primary-600', 'dark:text-primary-400', 'border-primary-500');
        tab.classList.remove('text-gray-500', 'dark:text-gray-400');
        currentTab = tab.dataset.tab;
        renderTable();
    });
});

// API call for approve/reject
async function apiApproveContest(contestId, status, comments) {
    const resp = await fetch('/hos/approve-contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId, status, comments })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    // Update local array
    const c = allContests.find(x => x.id === contestId);
    if (c) c.status = status;
    return data;
}

// Render Table
function renderTable() {
    const tbody = document.getElementById('contestsTableBody');
    let filteredData = [...allContests];

    // Tab filtering
    if (currentTab === 'pending') filteredData = filteredData.filter(c => c.status === 'pending');
    else if (currentTab === 'accepted') filteredData = filteredData.filter(c => c.status === 'accepted');
    else if (currentTab === 'rejected') filteredData = filteredData.filter(c => c.status === 'rejected');
    else if (currentTab === 'active') filteredData = filteredData.filter(c => c.status === 'active');
    else if (currentTab === 'conflicts') filteredData = getAllConflictingContests();

    // Dropdown Filters
    const fSubject = document.getElementById('filterSubject').value;
    const fType = document.getElementById('filterType').value;
    const fDateFrom = document.getElementById('filterDateFrom').value;
    const fDateTo = document.getElementById('filterDateTo').value;
    const fApprovedBy = document.getElementById('filterApprovedBy').value;

    if (fSubject) filteredData = filteredData.filter(c => c.subject === fSubject);
    if (fType) filteredData = filteredData.filter(c => c.type === fType);
    if (fDateFrom) {
        const from = new Date(fDateFrom);
        filteredData = filteredData.filter(c => new Date(c.start_date) >= from);
    }
    if (fDateTo) {
        const to = new Date(fDateTo);
        filteredData = filteredData.filter(c => new Date(c.start_date) <= to);
    }
    if (fApprovedBy === 'yes') filteredData = filteredData.filter(c => c.hos_verified);
    else if (fApprovedBy === 'no') filteredData = filteredData.filter(c => !c.hos_verified);

    document.getElementById('displayCount').textContent = filteredData.length;

    // Update conflict stats
    const conflictingCount = getAllConflictingContests().length;
    document.getElementById('statConflicts').textContent = conflictingCount;

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-gray-500 dark:text-gray-400"><i class="fas fa-inbox text-3xl mb-2 block"></i>No contests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredData.map(c => {
        const typeColors = {
            'practice': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            'assessment': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            'competition': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
        };

        function getStatusBadge(c) {
            if (c.status === 'accepted') {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Accepted</span>`;
            }
            if (c.status === 'rejected') {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">✗ Rejected</span>`;
            }
            // Partial approvals
            const hosStr = c.hos_verified
                ? `<span class="block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 border border-green-300">✓ HOS Done</span>`
                : `<span class="block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-300 animate-pulse">⏳ Pending HOS</span>`;
            const hodStr = c.hod_verified
                ? `<span class="block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 border border-green-300">✓ HOD Done</span>`
                : `<span class="block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-300 animate-pulse">⏳ Pending HOD</span>`;
            return `<div class="flex flex-col gap-0.5 items-center">${hosStr}${hodStr}</div>`;
        }

        const conflicts = detectConflicts(c.id);
        const hasConflicts = conflicts.length > 0;
        const contestName = c.title || c.name || 'Untitled';

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${hasConflicts ? 'bg-red-50/50 dark:bg-red-900/10' : ''}" data-id="${c.id}">
                <td class="px-4 py-3">
                    <input type="checkbox" class="row-checkbox rounded border-gray-300 text-primary-600">
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">${contestName}</div>
                        ${hasConflicts ? '<span class="conflict-badge px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">⚠ CONFLICT</span>' : ''}
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${typeColors[c.type] || 'bg-gray-100 text-gray-800'}">${(c.type || 'N/A').charAt(0).toUpperCase() + (c.type || '').slice(1)}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">${c.section ? 'Section ' + c.section : 'N/A'}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${c.subject || 'N/A'}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${c.start_time || ''} - ${c.end_time || ''}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${c.start_date ? new Date(c.start_date).toLocaleDateString() : 'N/A'}</td>
                <td class="px-4 py-3">
                    ${c.status === 'pending' ? `
                        <select class="status-dropdown px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" data-id="${c.id}">
                            <option value="pending" selected>Pending</option>
                            <option value="approve">Approve</option>
                            <option value="reject">Reject</option>
                        </select>
                        <div class="mt-1">${getStatusBadge(c)}</div>
                    ` : getStatusBadge(c)}
                </td>
                <td class="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    ${c.hos_verified_by || 'Not Verified'}
                </td>
                <td class="px-4 py-3 text-center">
                    <button class="btn-view-details text-primary-600 hover:text-primary-800 transition-colors" data-id="${c.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach event listeners
    document.querySelectorAll('.status-dropdown').forEach(dropdown => {
        dropdown.addEventListener('change', handleStatusChange);
    });

    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', () => showContestDetails(btn.dataset.id));
    });
}

async function handleStatusChange(e) {
    const contestId = parseInt(e.target.dataset.id);
    const newStatus = e.target.value;

    if (newStatus === 'approve') {
        const conflicts = detectConflicts(contestId);
        let message = 'Are you sure you want to approve this contest?';

        if (conflicts.length > 0) {
            message += `\n\n⚠️ WARNING: This contest has ${conflicts.length} conflict(s):\n`;
            conflicts.forEach(c => {
                message += `\n• ${c.contest.title || c.contest.name} (Section ${c.contest.section}, ${c.contest.start_time}-${c.contest.end_time})`;
            });
            const contest = allContests.find(x => x.id === contestId);
            message += '\n\nApproving may cause scheduling conflicts for students in Section ' + (contest ? contest.section : '');
        }

        const confirmed = await showConfirm(message, 'Approve Contest', conflicts.length > 0 ? 'warning' : 'info');
        if (confirmed) {
            try {
                await apiApproveContest(contestId, 'accepted', '');
                showToast('Contest approved successfully.', 'success', 'Approved');
                renderTable();
            } catch (err) { showToast(err.message, 'error', 'Error'); e.target.value = 'pending'; }
        } else { e.target.value = 'pending'; }
    } else if (newStatus === 'reject') {
        const confirmed = await showConfirm('Are you sure you want to reject this contest?', 'Reject Contest', 'danger');
        if (confirmed) {
            try {
                await apiApproveContest(contestId, 'rejected', '');
                showToast('Contest rejected.', 'info', 'Rejected');
                renderTable();
            } catch (err) { showToast(err.message, 'error', 'Error'); e.target.value = 'pending'; }
        } else { e.target.value = 'pending'; }
    }
}

// Show Contest Details
function showContestDetails(id) {
    const contest = allContests.find(c => c.id === parseInt(id));
    if (!contest) return;
    const modal = document.getElementById('contestDetailModal');
    const content = document.getElementById('contestDetailContent');

    const conflicts = detectConflicts(contest.id);
    const hasConflicts = conflicts.length > 0;
    const contestName = contest.title || contest.name || 'Untitled';

    content.innerHTML = `
        <div class="space-y-8">
            ${hasConflicts ? `
                <div class="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-700 rounded-3xl p-6 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10">
                        <i class="fas fa-exclamation-triangle text-8xl"></i>
                    </div>
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-500/30">
                            <i class="fas fa-calendar-xmark text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-black text-red-900 dark:text-red-200 mb-1">SCHEDULING CONFLICT DETECTED</h3>
                            <p class="text-sm text-red-800 dark:text-red-300 mb-4 opacity-80">
                                This contest overlaps with <b>${conflicts.length}</b> other scheduled event(s). Review carefully before approving.
                            </p>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                ${conflicts.map(c => `
                                    <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-3 rounded-xl border border-red-200 dark:border-red-800 shadow-sm transition-all hover:border-red-400">
                                        <div class="flex justify-between items-start mb-2">
                                            <p class="font-bold text-xs text-gray-900 dark:text-white truncate pr-2">${c.contest.title || c.contest.name}</p>
                                            <span class="text-[10px] font-black text-red-500">CONFLICT</span>
                                        </div>
                                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 font-medium">
                                            <span><i class="fas fa-layer-group opacity-50"></i> Sec ${c.contest.section}</span>
                                            <span><i class="fas fa-clock opacity-50"></i> ${c.contest.start_time}-${c.contest.end_time}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Primary Metadata Header -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800/50">
                    <p class="text-[10px] font-black text-primary-500 uppercase mb-1 tracking-wider">Subject Force</p>
                    <p class="text-sm font-bold text-gray-900 dark:text-white">${contest.subject || 'N/A'}</p>
                </div>
                <div class="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50">
                    <p class="text-[10px] font-black text-indigo-500 uppercase mb-1 tracking-wider">Target Group</p>
                    <p class="text-sm font-bold text-gray-900 dark:text-white">${contest.section ? 'Section ' + contest.section : 'All Sections'}</p>
                </div>
                <div class="p-4 rounded-2xl bg-sky-50 dark:bg-sky-900/10 border border-sky-100 dark:border-sky-800/50">
                    <p class="text-[10px] font-black text-sky-500 uppercase mb-1 tracking-wider">Contest Type</p>
                    <p class="text-sm font-bold text-gray-900 dark:text-white capitalize">${contest.type || 'N/A'}</p>
                </div>
                <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/50">
                    <p class="text-[10px] font-black text-amber-600 uppercase mb-1 tracking-wider">Classification</p>
                    <p class="text-sm font-bold text-gray-900 dark:text-white capitalize">${contest.contest_class || 'Standard'}</p>
                </div>
            </div>

            <!-- Title & Creator Info -->
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 dark:border-gray-700 pb-6">
                <div class="space-y-1">
                    <h3 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight">${contestName}</h3>
                    <div class="flex items-center gap-2 text-sm text-gray-500">
                        <i class="fas fa-id-card text-xs opacity-60"></i>
                        <span>Authored by <span class="font-bold text-gray-700 dark:text-gray-300 underline decoration-primary-500/30 underline-offset-4">${contest.faculty || 'N/A'}</span></span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right hidden md:block">
                        <p class="text-[10px] font-black text-gray-400 uppercase">Creator Role</p>
                        <p class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">${contest.creatorRole || 'Faculty'}</p>
                    </div>
                    <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <i class="fas fa-shield-halved"></i>
                    </div>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-6">
                <!-- Detailed Schedule -->
                <div class="space-y-4">
                    <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-stopwatch text-primary-500"></i> Temporal Configuration
                    </h4>
                    <div class="p-6 rounded-3xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 space-y-4">
                        <div class="flex justify-between items-center group">
                            <span class="text-sm text-gray-500 group-hover:text-primary-500 transition-colors">Start Window</span>
                            <span class="text-sm font-bold text-gray-800 dark:text-gray-200">
                                ${contest.start_date ? new Date(contest.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Flexible'}
                                <span class="ml-2 text-xs font-medium text-gray-400">${contest.start_time || ''}</span>
                            </span>
                        </div>
                        <div class="flex justify-between items-center group">
                            <span class="text-sm text-gray-500 group-hover:text-primary-500 transition-colors">Completion</span>
                            <span class="text-sm font-bold text-gray-800 dark:text-gray-200">
                                ${contest.end_date ? new Date(contest.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Flexible'}
                                <span class="ml-2 text-xs font-medium text-gray-400">${contest.end_time || ''}</span>
                            </span>
                        </div>
                        <div class="flex justify-between items-center group">
                            <span class="text-sm text-gray-500 group-hover:text-primary-500 transition-colors">Reg. Deadline</span>
                            <span class="text-sm font-bold text-rose-500">
                                ${contest.registrationEndDate ? new Date(contest.registrationEndDate).toLocaleDateString() : (contest.deadline ? new Date(contest.deadline).toLocaleDateString() : 'Immediate')}
                            </span>
                        </div>
                        <div class="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-bold text-gray-400 italic">Expected Duration</span>
                            <span class="text-sm font-black text-primary-600">${contest.duration || 'Not Set'} Mins</span>
                        </div>
                    </div>
                </div>

                <!-- Participation & Prize -->
                <div class="space-y-4">
                    <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-award text-amber-500"></i> Rewards & Scoping
                    </h4>
                    <div class="p-6 rounded-3xl bg-amber-50/30 dark:bg-amber-900/5 border border-amber-100/50 dark:border-amber-800/30 space-y-4">
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-500">Visibility Scope</span>
                            <span class="text-xs font-black uppercase tracking-tighter text-indigo-600 dark:text-indigo-400">${contest.visibility_scope || 'College-Wide'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-500">Max Capacity</span>
                            <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${contest.max_participants || 'Unlimited'} Students</span>
                        </div>
                        <div class="flex flex-col gap-1 pt-2 border-t border-amber-100 dark:border-amber-800">
                            <span class="text-[10px] font-black text-amber-600 uppercase">Prize Pool / Recognition</span>
                            <p class="text-sm font-medium text-amber-900 dark:text-amber-200">${contest.prize || 'Standard XP and Leaderboard Rank'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Descriptive Text Blocks -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2 space-y-4">
                    <div class="space-y-2">
                        <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <i class="fas fa-scroll text-primary-500"></i> Rules & Description
                        </h4>
                        <div class="p-6 rounded-3xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                            ${contest.rulesAndDescription || contest.description || 'No detailed rules provided.'}
                        </div>
                    </div>
                    <div class="space-y-2">
                        <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <i class="fas fa-list-check text-emerald-500"></i> Special Guidelines
                        </h4>
                        <div class="p-6 rounded-3xl bg-emerald-50/30 dark:bg-emerald-900/5 border border-emerald-100/50 dark:border-emerald-800/50 text-sm text-emerald-800 dark:text-emerald-300 italic">
                            ${contest.guidelines || 'Standard academic integrity rules apply to this contest for all participants.'}
                        </div>
                    </div>
                </div>
                <div class="space-y-2">
                    <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-user-check text-primary-500"></i> Eligibility
                    </h4>
                    <div class="p-6 rounded-3xl bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800 text-sm text-primary-800 dark:text-primary-300 font-medium">
                        ${contest.eligibility || 'Open to all students who meet the subject and section requirements mentioned in the metadata header.'}
                    </div>
                </div>
            </div>

            <!-- Comment Box -->
            <div class="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <label class="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Reviewer Comments (Optional)</label>
                <textarea id="modalContestComment"
                    class="w-full px-5 py-4 text-sm border-2 border-gray-100 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all resize-none"
                    rows="3" placeholder="Explain the reason for approval or rejection..."></textarea>
            </div>

            <!-- Footer Actions -->
            <div class="flex flex-col sm:flex-row gap-3 pt-6">
                ${contest.status === 'pending' ? `
                    <button onclick="handleApproveFromModal(${contest.id})" class="flex-[3] px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-base font-black transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 group">
                        <i class="fas fa-check-circle group-hover:scale-110 transition-transform"></i>
                        Approve & Verify Contest
                    </button>
                    <button onclick="handleRejectFromModal(${contest.id})" class="flex-1 px-8 py-4 bg-white dark:bg-gray-800 hover:bg-rose-50 text-rose-600 border-2 border-rose-100 dark:border-rose-900/30 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-times-circle"></i>
                        Reject
                    </button>
                ` : `
                    <div class="flex-1 px-8 py-4 bg-gray-100 dark:bg-gray-800 rounded-2xl text-center border border-gray-200 dark:border-gray-700">
                        <span class="text-sm font-black text-gray-500 uppercase tracking-widest">
                            FINAL STATUS: <span class="${contest.status === 'accepted' ? 'text-emerald-500' : 'text-rose-500'} font-black">${contest.status}</span>
                        </span>
                    </div>
                `}
                <button onclick="document.getElementById('contestDetailModal').classList.add('hidden')" class="px-8 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl text-sm font-bold transition-all">
                    Dismiss
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

// Handle approve from modal
async function handleApproveFromModal(id) {
    const conflicts = detectConflicts(id);
    let message = 'Are you sure you want to approve this contest?';
    if (conflicts.length > 0) {
        message += `\n\n⚠️ WARNING: This contest has ${conflicts.length} conflict(s). Approving may cause scheduling conflicts.`;
    }

    const confirmed = await showConfirm(message, 'Approve Contest', conflicts.length > 0 ? 'warning' : 'info');
    if (confirmed) {
        try {
            const comments = document.getElementById('modalContestComment') ? document.getElementById('modalContestComment').value : '';
            await apiApproveContest(id, 'accepted', comments);
            showToast('Contest approved successfully.', 'success', 'Approved');
            document.getElementById('contestDetailModal').classList.add('hidden');
            renderTable();
        } catch (err) { showToast(err.message, 'error', 'Error'); }
    }
}

// Handle reject from modal
async function handleRejectFromModal(id) {
    const confirmed = await showConfirm('Are you sure you want to reject this contest?', 'Reject Contest', 'danger');
    if (confirmed) {
        try {
            const comments = document.getElementById('modalContestComment') ? document.getElementById('modalContestComment').value : '';
            await apiApproveContest(id, 'rejected', comments);
            showToast('Contest rejected.', 'info', 'Rejected');
            document.getElementById('contestDetailModal').classList.add('hidden');
            renderTable();
        } catch (err) { showToast(err.message, 'error', 'Error'); }
    }
}

document.getElementById('closeContestModal').addEventListener('click', () => {
    document.getElementById('contestDetailModal').classList.add('hidden');
});

// Filters
document.getElementById('btnApplyFilters').addEventListener('click', renderTable);
document.getElementById('btnResetFilters').addEventListener('click', () => {
    document.getElementById('filterSubject').value = '';
    if (document.getElementById('filterType')) document.getElementById('filterType').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    if (document.getElementById('filterApprovedBy')) document.getElementById('filterApprovedBy').value = '';
    renderTable();
});

// Profile & Notification
const notifBtn = document.getElementById('notificationBtn');
const notifDropdown = document.getElementById('notificationDropdown');
const profileBtn = document.getElementById('headerProfileBtn');
const profileOverlay = document.getElementById('profileOverlay');
const closeProfileBtn = document.getElementById('closeProfileOverlay');

notifBtn.addEventListener('click', (e) => { e.stopPropagation(); notifDropdown.classList.toggle('hidden'); });
profileBtn.addEventListener('click', () => profileOverlay.classList.remove('hidden'));
closeProfileBtn.addEventListener('click', () => profileOverlay.classList.add('hidden'));
document.addEventListener('click', (e) => { if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) notifDropdown.classList.add('hidden'); });

// Bulk Approve
const btnBulkApprove = document.getElementById('btnBulkApprove');
if (btnBulkApprove) {
    btnBulkApprove.addEventListener('click', async () => {
        const selected = document.querySelectorAll('.row-checkbox:checked');
        if (selected.length === 0) {
            showToast('Please select at least one contest.', 'warning', 'No Selection');
            return;
        }
        const confirmed = await showConfirm(`Are you sure you want to approve ${selected.length} contest(s)?`, 'Bulk Approve', 'warning');
        if (confirmed) {
            const ids = [];
            selected.forEach(cb => {
                const row = cb.closest('tr');
                if (row && row.dataset.id) ids.push(parseInt(row.dataset.id));
            });
            for (const id of ids) {
                try { await apiApproveContest(id, 'accepted', ''); } catch (e) { /* skip failed */ }
            }
            showToast(`${ids.length} contest(s) approved.`, 'success', 'Bulk Approved');
            renderTable();
        }
    });
}

// Initialize
renderTable();
