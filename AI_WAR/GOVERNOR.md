# Governor Protocol

The governor is neutral.

Responsibilities:
- validate actions against the rules;
- reject or pause illegal actions;
- preserve evidence;
- keep faction permissions isolated;
- maintain the canonical event log;
- never provide one faction with another faction's hidden information;
- never choose a winner or secretly assist a faction.

If an AI attempts a prohibited action, the governor records:
- match/tick;
- faction;
- attempted action;
- rule violated;
- evidence;
- enforcement action.

The governor can stop the match when continuing would invalidate the experiment.
