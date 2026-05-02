import sys
import time

# STAGE 1: The Art
# We use r""" (Raw Strings) so the backslashes don't break!
frame_1 = r"""
   ( •_•)
   <)   )b
    /   \
"""

frame_2 = r"""
  ~( •_•)~
    )   )
   /   \
"""

def start_vibe():
    frames = [frame_1, frame_2]
    
    # Hide the blinking cursor for a cleaner look
    sys.stdout.write("\033[?25l")
    
    try:
        while True:
            for frame in frames:
                # This code \033[H 'teleports' the cursor to the top-left
                sys.stdout.write("\033[H") 
                sys.stdout.write(frame)
                sys.stdout.flush()
                time.sleep(0.5) # The 'pulse' of your animation
    except KeyboardInterrupt:
        # Bring the cursor back when you hit Ctrl+C
        sys.stdout.write("\033[?25h")
        print("\nVibe check complete.")

if __name__ == "__main__":
    start_vibe()