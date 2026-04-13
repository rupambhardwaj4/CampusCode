import os

file_path = r'c:\Users\HP\Desktop\CampusCode\routes\hod.js'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# find computeDurationFromRange
start_idx = -1
for i, line in enumerate(lines):
    if "const computeDurationFromRange = (startDate, endDate) => {" in line:
        start_idx = i
        break

if start_idx != -1:
    # We want to keep computeDurationFromRange intact and put helpers BEFORE or AFTER it.
    # Currently it's messy.
    
    # Let's just redefine the whole section from line 29 to where the original body ends.
    # The original body ended at line 38 before my first mess-up.
    
    # I'll just rewrite the whole module head.
    
    new_head = """    const computeDurationFromRange = (startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
        const totalMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
        if (totalMinutes < 60) return `${totalMinutes} mins`;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    };

    const dbGet = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => err ? reject(err) : resolve(row));
    });
    const dbAll = (query, params = []) => new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
    });

    const parseContestProblemIds = (rawProblems) => {
        let parsed = [];
        if (Array.isArray(rawProblems)) {
            parsed = rawProblems;
        } else if (typeof rawProblems === 'string' && rawProblems.trim()) {
            try {
                const fromJson = JSON.parse(rawProblems);
                parsed = Array.isArray(fromJson) ? fromJson : [];
            } catch {
                parsed = [];
            }
        }
        return parsed
            .map((item) => Number(typeof item === 'object' && item !== null ? item.id : item))
            .filter((id) => Number.isInteger(id) && id > 0);
    };

    const getContestProblemIds = async (contest) => {
        const fromJson = parseContestProblemIds(contest?.problems);
        if (fromJson.length) return fromJson;
        const rows = await dbAll(`SELECT problem_id FROM contest_problems WHERE contest_id = ?`, [contest.id]);
        return rows.map((row) => Number(row.problem_id)).filter((id) => Number.isInteger(id) && id > 0);
    };

    const buildContestLeaderboard = async (contest) => {
        const contestProblemIds = await getContestProblemIds(contest);
        if (!contestProblemIds.length) return [];

        const participantRows = await dbAll(`
            SELECT cp.user_id, cp.joined_at, u.fullName
            FROM contest_participants cp
            JOIN account_users u ON u.id = cp.user_id
            WHERE cp.contest_id = ?
        `, [contest.id]);

        const acceptedRows = await dbAll(`
            SELECT s.user_id, s.problem_id, MAX(s.points_earned) as best_points, MIN(s.createdAt) as first_solved_at
            FROM submissions s
            WHERE s.contest_id = ? AND s.status = 'accepted'
            GROUP BY s.user_id, s.problem_id
        `, [contest.id]);

        const records = new Map();
        participantRows.forEach((row) => {
            records.set(Number(row.user_id), {
                user_id: Number(row.user_id),
                fullName: row.fullName || 'Student',
                score: 0,
                solved: 0,
                firstSolvedAt: null
            });
        });

        for (const row of acceptedRows) {
            const problemId = Number(row.problem_id);
            if (!contestProblemIds.includes(problemId)) continue;
            const userId = Number(row.user_id);
            if (!records.has(userId)) {
                const user = await dbGet(`SELECT fullName FROM account_users WHERE id = ?`, [userId]);
                records.set(userId, {
                    user_id: userId,
                    fullName: user?.fullName || 'Student',
                    score: 0,
                    solved: 0,
                    firstSolvedAt: null
                });
            }
            const target = records.get(userId);
            target.score += Number(row.best_points || 0);
            target.solved += 1;
            if (!target.firstSolvedAt || new Date(row.first_solved_at).getTime() < new Date(target.firstSolvedAt).getTime()) {
                target.firstSolvedAt = row.first_solved_at;
            }
        }

        const leaderboard = Array.from(records.values()).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.solved !== a.solved) return b.solved - a.solved;
            const aTime = a.firstSolvedAt ? new Date(a.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.firstSolvedAt ? new Date(b.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
        });

        const total = leaderboard.length || 1;
        return leaderboard.map((entry, index) => ({
            ...entry,
            rank: index + 1,
            percentile: Math.max(1, Math.round(((total - index) / total) * 100))
        }));
    };
"""

    # We need to find where the mess ends. 
    # The mess ends at line 136 (in the current view).
    # That is `    };` followed by `const getUsersManagedByHod`.
    
    end_idx = -1
    for i in range(start_idx + 1, len(lines)):
        if "const getUsersManagedByHod" in lines[i]:
            end_idx = i
            break
            
    if end_idx != -1:
        # Replace lines from start_idx to end_idx-1
        del lines[start_idx:end_idx]
        lines.insert(start_idx, new_head + "\n\n")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print("Successfully fixed hod.js structure")
    else:
        print("Could not find getUsersManagedByHod anchor")
else:
    print("Could not find computeDurationFromRange anchor")
