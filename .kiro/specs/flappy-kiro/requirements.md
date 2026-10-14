# Requirements Document

## Introduction

Flappy Kiro is a retro-style, browser-based endless side-scrolling game. The player guides a white ghost character through a continuous series of green pipes that scroll from right to left. The ghost falls under constant gravity, and the player flaps the ghost upward by tapping, clicking, or pressing the spacebar. The player earns one point for each pair of pipes successfully passed. The game ends when the ghost collides with a pipe, the ground, or the ceiling. A high score persists across play sessions. The visual presentation mirrors the reference screenshot: a hazy blue sky with soft white rounded clouds, green pipes entering from the top and bottom with gaps to fly through, a dark ground strip along the bottom, and a score display at the bottom center formatted as "Score: N | High: M".

## Glossary

- **Game**: The complete Flappy Kiro browser application, including rendering, input, physics, scoring, and audio.
- **Ghost**: The player-controlled white ghost character sprite, rendered from `assets/ghosty.png`.
- **Pipe_Pair**: A set consisting of one top pipe descending from the ceiling and one bottom pipe rising from the ground, separated by a vertical gap through which the Ghost can pass.
- **Gap**: The vertical open space between the top pipe and bottom pipe of a Pipe_Pair.
- **Ground**: The dark strip rendered along the bottom edge of the play area that acts as the lower collision boundary.
- **Cloud**: A soft white rounded decorative shape rendered in the background sky as a semi-transparent (partially see-through) element. Multiple Clouds move horizontally at differing speeds, slower than the Pipe_Pairs, to create a parallax depth effect.
- **Ceiling**: The top edge of the play area that acts as the upper collision boundary.
- **Flap**: The upward velocity impulse applied to the Ghost in response to a player input action.
- **Gravity**: The constant downward acceleration continuously applied to the Ghost.
- **Score**: The count of Pipe_Pairs the Ghost has successfully passed during the current game session.
- **High_Score**: The highest Score the player has achieved, persisted across game sessions in the browser.
- **Score_Display**: The on-screen text at the bottom center showing the current Score and High_Score.
- **Game_State**: The current mode of the Game, one of Ready, Playing, or Game_Over.
- **Ready**: The Game_State before the first Flap of a session, when the Game is waiting for the player to start.
- **Playing**: The Game_State during active gameplay, when pipes scroll and physics apply.
- **Game_Over**: The Game_State after a collision, when gameplay has stopped and a restart is offered.
- **Jump_Sound**: The audio clip `assets/jump.wav` played when the Ghost flaps.
- **Game_Over_Sound**: The audio clip `assets/game_over.wav` played when a collision ends the game.

## Requirements

### Requirement 1: Run in a Web Browser

**User Story:** As a player, I want to play Flappy Kiro in my web browser, so that I can play without installing additional software.

#### Acceptance Criteria

1. WHEN the player opens the Game page in a web browser, THE Game SHALL render the play area containing the blue sky background, the Ground strip, the Ghost, and the Score_Display within 3 seconds of the page load completing.
2. WHEN the Game page finishes loading, THE Game SHALL enter the Ready Game_State and display the Score_Display showing a value of 0.
3. THE Game SHALL render the Ghost using the sprite asset located at `assets/ghosty.png`.
4. IF the sprite asset located at `assets/ghosty.png` fails to load, THEN THE Game SHALL render a placeholder shape at the Ghost position and continue to enter the Ready Game_State.

### Requirement 2: Ghost Gravity and Flap Control

**User Story:** As a player, I want to flap the ghost upward against gravity, so that I can control its vertical position.

#### Acceptance Criteria

1. WHILE the Game_State is Playing AND no Flap impulse is applied during the current frame, THE Game SHALL increase the Ghost's downward vertical velocity each frame by a constant Gravity acceleration, causing the Ghost's vertical position to move downward on each subsequent frame.
2. WHEN the player presses the spacebar during the Playing Game_State, THE Game SHALL set the Ghost's vertical velocity to a fixed upward value, causing the Ghost's vertical position to move upward on the next frame.
3. WHEN the player clicks the primary mouse button within the play area during the Playing Game_State, THE Game SHALL set the Ghost's vertical velocity to the same fixed upward value as a spacebar Flap, causing the Ghost's vertical position to move upward on the next frame.
4. WHEN the player performs a touch tap within the play area during the Playing Game_State, THE Game SHALL set the Ghost's vertical velocity to the same fixed upward value as a spacebar Flap, causing the Ghost's vertical position to move upward on the next frame.
5. WHEN a Flap impulse is applied, THE Game SHALL play the Jump_Sound from `assets/jump.wav` within 100 milliseconds, restarting playback from the beginning if the Jump_Sound is already playing.
6. IF the Jump_Sound cannot be played when a Flap impulse is applied, THEN THE Game SHALL continue applying the Flap impulse and all other gameplay without interruption.
7. WHEN the player performs a Flap input while the Game_State is Ready, THE Game SHALL transition the Game_State to Playing and apply a single Flap impulse to the Ghost, setting the Ghost's vertical velocity to the fixed upward value.

### Requirement 3: Scrolling Pipes

**User Story:** As a player, I want pipes to scroll toward me with gaps to fly through, so that the game presents a continuous navigable challenge.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move each Pipe_Pair horizontally from the right edge toward the left edge of the play area at a constant speed between 100 and 300 pixels per second.
2. THE Game SHALL render each Pipe_Pair with one top pipe extending downward from the Ceiling and one bottom pipe extending upward from the Ground, separated by a vertical Gap between 100 and 200 pixels in height.
3. WHILE the Game_State is Playing, THE Game SHALL generate a new Pipe_Pair at the right edge of the play area at a fixed horizontal spacing between 150 and 400 pixels from the previous Pipe_Pair, so that at least one Pipe_Pair is present in the play area at all times during the session.
4. WHEN a Pipe_Pair moves so that its rightmost edge crosses the left edge of the play area, THE Game SHALL remove that Pipe_Pair from the play area within one update cycle.
5. WHEN the Game generates a Pipe_Pair, THE Game SHALL position the top edge of its Gap no closer than 50 pixels to the Ceiling and the bottom edge of its Gap no closer than 50 pixels to the Ground, so that the Ghost can pass through without contacting the Ground or Ceiling.
6. IF generating a new Pipe_Pair would place its Gap outside the allowed vertical range defined in criterion 5 by any amount of 1 pixel or greater, THEN THE Game SHALL clamp the Gap position to the nearest valid vertical location within that range and SHALL keep that Pipe_Pair rather than rejecting or regenerating it.

### Requirement 4: Scoring

**User Story:** As a player, I want to earn points for each pipe I pass, so that I can measure my performance.

#### Acceptance Criteria

1. WHEN the Game_State transitions to Playing at the start of a session, THE Game SHALL set the Score to zero.
2. WHEN the Ghost's horizontal position passes the trailing edge of a Pipe_Pair's Gap without the Ghost having collided with that Pipe_Pair, THE Game SHALL increase the Score by one.
3. IF the Ghost collides with a Pipe_Pair before its horizontal position passes the trailing edge of that Pipe_Pair's Gap, THEN THE Game SHALL NOT increase the Score for that Pipe_Pair.
4. THE Game SHALL render the current Score as a non-negative integer within the Score_Display positioned at the bottom center of the play area.
5. WHEN the Score increases, THE Game SHALL update the value shown in the Score_Display within 100 milliseconds to reflect the new Score.

### Requirement 5: Collision and Game Over

**User Story:** As a player, I want the game to end when the ghost crashes, so that there is a clear consequence and a goal to avoid failure.

#### Acceptance Criteria

1. WHEN the Ghost's bounding box overlaps the bounding box of any pipe of a Pipe_Pair during the Playing Game_State, THE Game SHALL transition the Game_State to Game_Over within 1 rendered frame of the overlap being detected.
2. WHEN the Ghost's bounding box overlaps the Ground boundary during the Playing Game_State, THE Game SHALL transition the Game_State to Game_Over within 1 rendered frame of the overlap being detected.
3. WHEN the Ghost's vertical position reaches or exceeds the Ceiling boundary during the Playing Game_State, THE Game SHALL transition the Game_State to Game_Over within 1 rendered frame of the boundary being reached.
4. WHEN the Game_State transitions to Game_Over, THE Game SHALL play the Game_Over_Sound from `assets/game_over.wav` exactly once per transition.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop applying Gravity-driven movement to pipes within 1 rendered frame of the transition.
6. WHEN the Game_State transitions to Game_Over, THE Game SHALL halt Pipe_Pair generation such that no new Pipe_Pair is created while the Game_State remains Game_Over.
7. IF the Game_Over_Sound asset at `assets/game_over.wav` fails to load or play, THEN THE Game SHALL complete the transition to Game_Over without the sound and continue running without interruption.

### Requirement 6: High Score Tracking

**User Story:** As a player, I want my best score to be remembered, so that I can try to beat my personal record across sessions.

#### Acceptance Criteria

1. WHEN the Game_State transitions to Game_Over AND the Score is greater than the stored High_Score, THE Game SHALL set the High_Score to the Score, where the High_Score is an integer in the range 0 to 999,999.
2. WHEN the High_Score changes, THE Game SHALL persist the High_Score in browser local storage.
3. IF persisting the High_Score to browser local storage fails, THEN THE Game SHALL retain the current in-memory High_Score value and continue gameplay without interrupting the player.
4. WHEN the Game page loads AND a persisted High_Score exists in browser local storage as a valid integer in the range 0 to 999,999, THE Game SHALL load that value as the High_Score.
5. IF no persisted High_Score exists when the Game page loads, OR the persisted value is missing, non-numeric, or outside the range 0 to 999,999, THEN THE Game SHALL set the High_Score to zero.
6. THE Game SHALL render the High_Score as an integer within the Score_Display at the bottom center of the play area.

### Requirement 7: Score Display Formatting

**User Story:** As a player, I want to see my current score and high score together, so that I can track my progress at a glance.

#### Acceptance Criteria

1. THE Score_Display SHALL present the current Score and the High_Score in the format "Score: N | High: M", where N is the current Score rendered as a base-10 integer and M is the High_Score rendered as a base-10 integer, with no leading zeros.
2. THE Game SHALL render the Score_Display horizontally centered within the play area and vertically positioned over the Ground strip, such that the full "Score: N | High: M" text remains within the play area bounds for Score and High_Score values from 0 to 9999.
3. WHEN the Score changes, THE Game SHALL update the Score_Display to show the new Score value within 100 milliseconds of the change.
4. IF the High_Score is unavailable or cannot be read, THEN THE Score_Display SHALL present the High_Score value as 0 and continue to display the current Score.

### Requirement 8: Restart After Game Over

**User Story:** As a player, I want to restart the game after a crash, so that I can play again without reloading the page.

#### Acceptance Criteria

1. WHILE the Game_State is Game_Over, THE Game SHALL accept a Flap input action as a request to restart the Game.
2. WHEN the player performs a restart input during the Game_Over Game_State, THE Game SHALL reset the Score to zero.
3. WHEN the player performs a restart input during the Game_Over Game_State, THE Game SHALL remove all existing Pipe_Pairs from the play area.
4. WHEN the player performs a restart input during the Game_Over Game_State, THE Game SHALL reposition the Ghost to its starting location and transition the Game_State to Ready within 500 milliseconds.
5. WHEN the Game resets for a restart, THE Game SHALL retain the current High_Score value unchanged.
6. IF a Flap input action occurs within 300 milliseconds after the Game_State transitions to Game_Over, THEN THE Game SHALL discard the input without queuing or buffering it and remain in the Game_Over Game_State, so that the discarded input does not trigger a restart after the 300 millisecond window expires.

### Requirement 9: Retro Visual Presentation

**User Story:** As a player, I want the game to look like the reference screenshot with layered moving clouds, so that it has the intended retro aesthetic with a sense of depth.

#### Acceptance Criteria

1. WHILE the game is rendering a frame, THE Game SHALL draw the background as a blue sky across the full play area and overlay between 1 and 5 white Cloud shapes with rounded edges.
2. WHILE the game is rendering a frame, THE Game SHALL render each Cloud as semi-transparent, with an opacity greater than 0 percent and less than 100 percent, so that the blue sky remains partially visible through each Cloud.
3. WHILE the Game_State is Ready or Playing, THE Game SHALL move each Cloud horizontally from right to left, and THE Game SHALL assign Clouds at least two distinct horizontal speeds so that Clouds on different layers move at different rates, producing a parallax depth effect.
4. WHILE the Game_State is Playing, THE Game SHALL move every Cloud at a horizontal speed slower than the Pipe_Pair scroll speed, so that Clouds appear farther away than the pipes.
5. WHEN a Cloud moves completely past the left edge of the play area, THE Game SHALL reposition that Cloud beyond the right edge so that Clouds are continuously present in the background.
6. WHILE the game is rendering a frame, THE Game SHALL draw every visible pipe filled in green.
7. WHILE the game is rendering a frame, THE Game SHALL draw the Ground as a dark horizontal strip spanning the full width of the play area along its bottom edge.
8. WHILE the Score_Display is visible, THE Game SHALL render the Score_Display text in white.
9. IF a required visual asset fails to load, THEN THE Game SHALL render a solid fallback fill color that approximates the intended asset's appearance for the affected element, such as green for a pipe fallback and blue for the sky fallback, and continue rendering all remaining elements without interruption.
