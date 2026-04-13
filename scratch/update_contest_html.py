import os

file_path = r'c:\Users\HP\Desktop\CampusCode\views\hod\contest.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the server-side buttons
old_buttons = """<button
                                    class="btn-view-details px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    data-title="<%= c.title %>"
                                    data-eligibility="<%= c.eligibility || 'All Students' %>"
                                    data-desc="<%= c.description %>"
                                    data-deadline="<%= c.endTime %>">
                                    <i class="far fa-eye"></i>
                                </button>"""

new_buttons = """<a href="/college/hod/contest/view/<%= c.id %>"
                                    class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title="View Detailed Info">
                                    <i class="far fa-eye"></i>
                                </a>"""

content = content.replace(old_buttons, new_buttons)

old_leaderboard = """<button
                                    class="btn-view-leaderboard flex-1 md:flex-none px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                                    Leaderboard
                                </button>"""

new_leaderboard = """<a href="/college/hod/contest/leaderboard/<%= c.id %>"
                                    class="flex-1 md:flex-none px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                                    Leaderboard
                                </a>"""

content = content.replace(old_leaderboard, new_leaderboard)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated contest.html")
