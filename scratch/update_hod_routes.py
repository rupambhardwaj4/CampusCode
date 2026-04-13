import os

file_path = r'c:\Users\HP\Desktop\CampusCode\routes\hod.js'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_routes = """
    // HOD: Contest View (Details)
    router.get('/hod/contest/view/:id', requireRole('hod'), checkScope, async (req, res) => {
        const contestId = Number(req.params.id);
        const college = req.session.user.collegeName;
        const dept = req.session.user.department;

        try {
            const contest = await dbGet(`
                SELECT c.*, u.fullName as creatorName, u2.fullName as approverName
                FROM contests c
                LEFT JOIN account_users u ON c.createdBy = u.id
                LEFT JOIN account_users u2 ON c.approved_by = u2.id
                WHERE c.id = ? AND (c.collegeName = ? OR c.department = ?)
            `, [contestId, college, dept]);

            if (!contest) return res.status(404).send("Contest not found or access denied.");

            const problemIds = await getContestProblemIds(contest);
            let contestProblems = [];
            if (problemIds.length) {
                const placeholders = problemIds.map(() => '?').join(',');
                contestProblems = await dbAll(`
                    SELECT id, title, subject, difficulty, status
                    FROM problems
                    WHERE id IN (${placeholders})
                `, problemIds);
            }

            const leaderboard = await buildContestLeaderboard(contest);
            const leaderboardPreview = leaderboard.slice(0, 5);

            res.render('hod/contest_view.html', {
                user: req.session.user,
                contest: normalizeContestRecord(contest),
                contestProblems,
                leaderboardPreview,
                backPath: '/college/hod/contest',
                currentPage: 'contest'
            });
        } catch (err) {
            console.error(err);
            res.status(500).send(err.message);
        }
    });

    // HOD: Contest Leaderboard
    router.get('/hod/contest/leaderboard/:id', requireRole('hod'), checkScope, async (req, res) => {
        const contestId = Number(req.params.id);
        const college = req.session.user.collegeName;
        const dept = req.session.user.department;

        try {
            const contest = await dbGet(`
                SELECT * FROM contests WHERE id = ? AND (collegeName = ? OR department = ?)
            `, [contestId, college, dept]);

            if (!contest) return res.status(404).send("Contest not found or access denied.");

            const leaderboard = await buildContestLeaderboard(contest);
            
            // Calculate summary stats
            const participants = leaderboard.length;
            const submissionsRow = await dbGet(`SELECT COUNT(*) as cnt FROM submissions WHERE contest_id = ?`, [contestId]);
            const totalSolved = leaderboard.reduce((acc, entry) => acc + entry.solved, 0);
            const topScore = leaderboard.length > 0 ? leaderboard[0].score : 0;

            res.render('hod/contest_leaderboard.html', {
                user: req.session.user,
                contest: normalizeContestRecord(contest),
                leaderboard,
                summary: {
                    participants,
                    submissions: submissionsRow?.cnt || 0,
                    totalSolved,
                    topScore
                },
                backPath: '/college/hod/contest',
                currentPage: 'contest'
            });
        } catch (err) {
            console.error(err);
            res.status(500).send(err.message);
        }
    });

"""

# Insert before router.get('/hod/community'
found = False
for i, line in enumerate(lines):
    if "router.get('/hod/community'" in line:
        lines.insert(i, new_routes)
        found = True
        break

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Successfully updated hod.js")
else:
    print("Could not find community route anchor")
