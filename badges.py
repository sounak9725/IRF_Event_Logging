import requests
import matplotlib
matplotlib.use('Agg')  # Set backend before importing pyplot
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timezone
from time import sleep
import sys
from pathlib import Path
import json
from typing import List, Tuple

# Will print current amount of badges tracked if True
# Recommended if user has a lot of badges and you want to see progress
PRINT_PROGRESS = True
BATCH_PER_PRINT = 1000

# Configuration constants
ENEMY_GROUP_IDS = {4886107, 33658648, 5248163}
MAX_GROUPS = 100
IRF_BADGE_IDS = {740669344, 740670240, 740670075, 975304622, 1182288338, 975304240, 740671144, 740670409, 2124524239, 2147653908, 1182287399, 2124524241, 2124524238, 2124524234, 2124524236, 2124524237, 2124524245, 2124465112, 966764102, 975303867, 3712288460535756}

banished_list = ["pokemondude77", "BlueBonsai_1991", "vul_lls", "jydffggf", "Flyaustingarner4", "Super_1imited", "Qupify", "jackisturn", "Matijaplays", "migvhtt", "RioSharkie", "RiceSovereign", "Conor_yy", "4sml", "ambidrome", "munifuu", "Peter25321", "restartlan", "Mattlakism", "GY_PN", "ClairoValerie"]

excommunicated_list = list(set(["Liosyphus", "Th3C8t", "Broahater", "K3pmes", "ApexKoi", "prakriti10", "unnamed7575", "Timon1y", "SergeyMeyer", "R_cktron", "AdalhardKristoff", "Coolbluej225", "Exolityte", "Aariciaaaa", "mister_momp", "cats9911", "WithoutRestraint", "Barronungern", "She_lls", "PROPLAYERU15", "kavilxo", "voicechat_Testing10", "EmperorOfCheeseistan", "Millilisaz", "Lam_Ch1nese", "778SAMURAI", "William_McIrvin", "CooISharkie", "FlyingMoonWah", "ImNotAJM", "Agent_Manyou", "ElvisaMoon", "hudfwgc", "Pawsterr", "Cerbezz", "ASaltedPotatoChip", "D00MSHUNTER", "starIinium", "IAMAPARROT1", "Tonk_Tran", "terrp_V", "Xx_Skyninja", "c_hr1sx", "Resonine", "Strettch", "Kucid_Larma52", "evilsoverall987", "overhandlamb300", "FemboyFrivvy", "1nterstellar_w2", "LordMeowus", "Bleuofficial", "Olegamer8", "Friz_Dzhugashvili", "Xelekt", "daniil07006", "Salvus_Dzhugashvili", "GLANDIONY", "Implexium", "Aqvoc_m", "D4M0ni05", "RedBoy13000", "Gotsutoizuna", "haus_1", "haus_2", "ww222ww", "OBJECT_200", "naividi", "Guest9987645", "The_no1pope", "wudja2", "F_arside"]))

sys.stdout.reconfigure(line_buffering=True)

def get_user_info(user_id: str) -> dict:
    """Get user information from Roblox API"""
    try:
        response = requests.get(f"https://users.roblox.com/v1/users/{user_id}")
        response.raise_for_status()
        return response.json()
    except:
        # Fallback to rotunnel if main API fails
        response = requests.get(f"https://users.rotunnel.com/v1/users/{user_id}")
        response.raise_for_status()
        return response.json()

def get_user_groups(user_id: str) -> List[dict]:
    """Get user's group memberships"""
    try:
        response = requests.get(f"https://groups.roblox.com/v1/users/{user_id}/groups/roles")
        response.raise_for_status()
        return response.json().get("data", [])
    except:
        # Fallback to rotunnel if main API fails
        response = requests.get(f"https://groups.rotunnel.com/v1/users/{user_id}/groups/roles")
        response.raise_for_status()
        return response.json().get("data", [])

def get_user_followers_count(user_id: str) -> int:
    """Get user's follower count"""
    try:
        response = requests.get(f"https://friends.roblox.com/v1/users/{user_id}/followers/count")
        response.raise_for_status()
        return response.json().get("count", 0)
    except:
        try:
            response = requests.get(f"https://friends.rotunnel.com/v1/users/{user_id}/followers/count")
            response.raise_for_status()
            return response.json().get("count", 0)
        except:
            return 0

def get_user_following_count(user_id: str) -> int:
    """Get user's following count"""
    try:
        response = requests.get(f"https://friends.roblox.com/v1/users/{user_id}/followings/count")
        response.raise_for_status()
        return response.json().get("count", 0)
    except:
        try:
            response = requests.get(f"https://friends.rotunnel.com/v1/users/{user_id}/followings/count")
            response.raise_for_status()
            return response.json().get("count", 0)
        except:
            return 0

def get_user_friends_count(user_id: str) -> int:
    """Get user's friends count"""
    try:
        response = requests.get(f"https://friends.roblox.com/v1/users/{user_id}/friends/count")
        response.raise_for_status()
        return response.json().get("count", 0)
    except:
        try:
            response = requests.get(f"https://friends.rotunnel.com/v1/users/{user_id}/friends/count")
            response.raise_for_status()
            return response.json().get("count", 0)
        except:
            return 0

def get_user_friends(user_id: str) -> List[dict]:
    """Get user's friends list"""
    try:
        response = requests.get(f"https://friends.roblox.com/v1/users/{user_id}/friends")
        response.raise_for_status()
        return response.json().get("data", [])
    except:
        try:
            response = requests.get(f"https://friends.rotunnel.com/v1/users/{user_id}/friends")
            response.raise_for_status()
            return response.json().get("data", [])
        except:
            return []

def check_enemy_groups(user_id: str, username: str):
    """Check if user is in enemy groups"""
    try:
        info = get_user_info(user_id)
        creation_date = f"{info['created'][8:10]}/{info['created'][5:7]}/{info['created'][:4]}"
        groups = get_user_groups(user_id)
        enemy_count = 0
        
        print(f"\n📖 Enemy groups check for \"{username}\" - \"{user_id}\" 📖")
        print("-" * 80)
        
        for group in groups:
            group_id = group["group"]["id"]
            group_name = group["group"]["name"]
            status = "❌ Enemy group." if group_id in ENEMY_GROUP_IDS else "✅ Not enemy group."
            if group_id in ENEMY_GROUP_IDS:
                enemy_count += 1
            print(f"Checking [{group_name}] | Status: {status}")
            sleep(0.2)
        
        print("-" * 80)
        print(f"[Total enemy groups: {enemy_count}]")
        print(f"[Total groups: {len(groups)}/{MAX_GROUPS}]")
        print(f"[Account creation date: {creation_date}]")
        print(f"[Display name: {info.get('displayName', 'N/A')}]")
        print(f"[Profile link: https://www.roblox.com/users/{user_id}/profile]")
        print(f"[Number of friends: {get_user_friends_count(user_id)}]")
        print(f"[Number of followers: {get_user_followers_count(user_id)}]")
        print(f"[Number of following: {get_user_following_count(user_id)}]")
        print("-" * 80)
    except Exception as e:
        print(f"Error checking enemy groups: {e}")

def check_friends(user_id: str, username: str):
    """Check if user is friends with banished/excommunicated users"""
    try:
        friends = get_user_friends(user_id)
        friend_usernames = [friend.get("name") for friend in friends if friend.get("name")]
        
        print(f"\n👥 Friends check for \"{username}\" - \"{user_id}\" 👥")
        print("-" * 80)
        print("[Banished List]")
        for user in banished_list:
            print(f"{user} | {'❌ Friend.' if user in friend_usernames else '✅ Not friend.'}")
        
        print("\n[Excommunicated List]")
        for user in excommunicated_list:
            print(f"{user} | {'❌ Friend.' if user in friend_usernames else '✅ Not friend.'}")
        print("-" * 80)
    except Exception as e:
        print(f"Error checking friends: {e}")

def fetch_badges(user_id: str, display_name: str) -> List[dict]:
    """
    Given a Roblox user ID, get the user's badge data.
    """
    url = f"https://badges.roblox.com/v1/users/{user_id}/badges?limit=100&sortOrder=Desc"
    badges = []
    cursor = None

    print("Loading badges...")
    print(f"Initial API URL: {url}")
    
    while True:
        params = {}
        if cursor:
            params['cursor'] = cursor

        try:
            print(f"Making request to: {url} with params: {params}")
            response = requests.get(url, params=params)
            print(f"Response status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            print(f"API response data keys: {list(data.keys())}")
            print(f"Number of badges in this response: {len(data.get('data', []))}")
        except Exception as e:
            print(f"Primary API failed: {e}")
            # Fallback to rotunnel
            alt_url = f"https://badges.rotunnel.com/v1/users/{user_id}/badges?limit=100&sortOrder=Desc"
            print(f"Trying fallback URL: {alt_url}")
            try:
                response = requests.get(alt_url, params=params)
                print(f"Fallback response status: {response.status_code}")
                response.raise_for_status()
                data = response.json()
                print(f"Fallback API response data keys: {list(data.keys())}")
                print(f"Number of badges in fallback response: {len(data.get('data', []))}")
            except Exception as fallback_error:
                print(f"Fallback API also failed: {fallback_error}")
                break

        badge_data = data.get('data', [])
        if not badge_data:
            print("No badge data found in API response")
            break
            
        for badge in badge_data:
            badges.append(badge)
            if PRINT_PROGRESS and len(badges) % BATCH_PER_PRINT == 0:
                print(f"{len(badges)} badges for {display_name} requested.")

        if data.get('nextPageCursor'):
            cursor = data['nextPageCursor']
            print(f"Found next page cursor: {cursor}")
        else:
            print("No more pages to fetch")
            break

    print(f"Total badges fetched: {len(badges)}")
    return badges

def convertDateToDatetime(date: str) -> datetime:
    """
    Given a timestamp string, convert to a datetime object.
    """
    # First try the modern approach
    if date.endswith('Z'):
        date = date[:-1] + '+00:00'
    try:
        return datetime.fromisoformat(date).astimezone(timezone.utc)
    except:
        # Fallback for various date formats
        original_date = date
        
        # Handle dates without 'Z' suffix
        has_z_suffix = date.endswith('Z')
        if not has_z_suffix:
            date = date + 'Z'
        
        # Handle microseconds formatting
        if '.' in date:
            parts = date.split('.')
            if len(parts) == 2:
                microseconds_part = parts[1][:-1] if has_z_suffix else parts[1][:-1]  # Remove 'Z'
                microseconds_length = len(microseconds_part)
                
                # Normalize microseconds to 6 digits for %f format
                if microseconds_length > 6:
                    microseconds_part = microseconds_part[:6]
                elif microseconds_length < 6:
                    microseconds_part = microseconds_part.ljust(6, '0')
                
                date = parts[0] + '.' + microseconds_part + 'Z'
        else:
            # Add microseconds if missing
            date = date[:-1] + '.000000Z'
        
        try:
            return datetime.strptime(date, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        except ValueError as e:
            # If all else fails, try without microseconds
            try:
                date_without_ms = original_date.split('.')[0]
                if not date_without_ms.endswith('Z'):
                    date_without_ms += 'Z'
                return datetime.strptime(date_without_ms, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                print(f"Failed to parse date: {original_date}")
                raise e

def fetch_award_dates(user_id: str, badges: List[dict], display_name: str) -> Tuple[List[str], List[datetime]]:
    """
    Make requests to Roblox's Badge API to get user's badge awarded dates.
    Returns a tuple of awarded dates list and the awarded dates of IRF Badges (if found).
    """
    dates = []
    highlight_dates = []
    badge_ids = [badge["id"] for badge in badges]
    url = f"https://badges.roblox.com/v1/users/{user_id}/badges/awarded-dates"
    STEP = 50  # Adjust step size as needed

    for i in range(0, len(badge_ids), STEP):
        try:
            params = {"badgeIds": badge_ids[i:i + STEP]}
            response = requests.get(url, params=params)

            # Retry if rate-limited
            retry_after = 5
            while response.status_code == 429:
                print(f"Rate limited. Retrying after {retry_after} seconds.")
                sleep(retry_after)
                response = requests.get(url, params=params)
                retry_after += 5

            if response.status_code != 200:
                # Try rotunnel fallback
                alt_url = f"https://badges.rotunnel.com/v1/users/{user_id}/badges/awarded-dates"
                response = requests.get(alt_url, params=params)
                while response.status_code == 429:
                    sleep(3)
                    response = requests.get(alt_url, params=params)

            response.raise_for_status()

            for badge in response.json().get("data", []):
                dates.append(badge["awardedDate"])

                if badge["badgeId"] in IRF_BADGE_IDS:
                    highlight_dates.append(convertDateToDatetime(badge["awardedDate"]))

                if PRINT_PROGRESS and len(dates) % BATCH_PER_PRINT == 0:
                    print(f"{len(dates)} awarded dates for {display_name} requested.")

        except Exception as e:
            print(f"Error fetching data: {e}")

    return dates, highlight_dates

def plot_cumulative_badges(display_name: str, user_id: str, dates: List[str], highlight_dates: List[datetime], badges: List[dict]):
    """
    Graph the cumulative total of badges over time and save the plot as an image file.
    Enhanced with color coding based on badge creators.
    """
    print(f"Starting plot generation for {display_name}")
    
    if not dates:
        print("No badge dates to plot.")
        return

    print(f"Processing {len(dates)} badge dates")
    
    # Sort badges by awarded date
    y_values = [convertDateToDatetime(date) for date in dates]
    y_values.sort()

    # Calculate cumulative count at each date
    curr_count = 0
    cumulative_counts = []
    for date in y_values:
        curr_count += 1
        cumulative_counts.append(curr_count)

    print(f"Calculated cumulative counts: {len(cumulative_counts)} points")

    # Count badges per creator for color coding
    creator_count = {}
    for badge in badges:
        creator_id = badge.get("creatorTargetId")
        if creator_id:
            creator_count[creator_id] = creator_count.get(creator_id, 0) + 1

    print(f"Creator analysis complete: {len(creator_count)} unique creators")

    try:
        # Plot the cumulative count over time
        print("Setting up matplotlib plot...")
        plt.style.use('dark_background')
        plt.xlabel('Badge Earned Date')
        plt.ylabel('Total Badges')
        plt.title(f'Badges over Time for {display_name}')

        print("Plotting badge points...")
        # Plot badges with color coding
        for idx, date in enumerate(y_values):
            badge = badges[idx] if idx < len(badges) else {}
            creator_id = badge.get("creatorTargetId")
            
            # Color code: red for creators with >70 badges, cyan for others
            if creator_count.get(creator_id, 0) > 70:
                color = (1, 0, 0, 0.4)  # Red with transparency
            else:
                color = (0, 1, 1, 0.2)  # Cyan with transparency
            
            plt.scatter(date, cumulative_counts[idx], marker='o', color=color)

        print("Highlighting IRF badges...")
        # Highlight IRF badges with a single legend entry
        first_legend = True
        for highlight_date in highlight_dates:
            if highlight_date in y_values:
                index = y_values.index(highlight_date)
                plt.scatter(
                    [highlight_date],
                    [cumulative_counts[index]],
                    marker='o',
                    color='lime',
                    label="IRF Game Badge" if first_legend else "",
                    s=50
                )
                first_legend = False

        print("Formatting axes...")
        # Set the X-axis format to 'Year' only
        ax = plt.gca()
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
        ax.xaxis.set_major_locator(mdates.YearLocator())

        plt.figtext(0.05, 0.95, f"Badge Count: {len(y_values)}", ha="left", va="top", color="white", transform=ax.transAxes)

        if highlight_dates:
            plt.legend(loc='lower right')
        plt.tight_layout()

        # Save the plot as an image file
        print("Creating graphs directory...")
        graphs_dir = Path("graphs")
        graphs_dir.mkdir(parents=True, exist_ok=True)
        
        output_path = f"graphs/{user_id}.png"
        print(f"Saving plot to: {output_path}")
        plt.savefig(output_path, dpi=100, bbox_inches='tight')
        
        # Verify file was created
        if Path(output_path).exists():
            file_size = Path(output_path).stat().st_size
            print(f"Plot saved successfully! File size: {file_size} bytes")
        else:
            print("ERROR: Plot file was not created!")
            
        plt.close()  # Close the plot to free resources
        print("Plot generation completed")
        
    except Exception as e:
        print(f"ERROR in plot generation: {e}")
        import traceback
        traceback.print_exc()

def process_user(user_id: str, username: str, additional_info: bool = False):
    """
    Process a user's badges and write structured output (JSON) for machine use.
    Enhanced with additional checks and information.
    """
    display_name = f"{username} ({user_id})" if username != "N/A" else user_id
    print(f"Processing {display_name}")

    # Perform enemy group and friends checks only if requested
    if additional_info:
        check_enemy_groups(user_id, username)
        check_friends(user_id, username)

    # Fetch and process badges
    badges = fetch_badges(user_id, display_name)
    dates, highlight_dates = fetch_award_dates(user_id, badges, display_name)

    # Prepare structured data
    date_objects = [convertDateToDatetime(date) for date in dates]
    date_objects.sort()
    total_badges = len(date_objects)
    first_badge_date = date_objects[0].isoformat() if date_objects else None
    irf_dates = [dt.isoformat() for dt in highlight_dates]

    output = {
        "total_badges": total_badges,
        "first_badge_date": first_badge_date,
        "irf_badge_dates": irf_dates
    }

    # Save JSON output
    irf_dir = Path("graphs")
    irf_dir.mkdir(parents=True, exist_ok=True)
    irf_file = irf_dir / f"{user_id}.json"
    with open(irf_file, 'w') as f:
        json.dump(output, f)

    plot_cumulative_badges(display_name, user_id, dates, highlight_dates, badges)
    print(f"Completed plot for {display_name}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <roblox_id> [roblox_username] [--additional-info]")
        sys.exit(1)

    roblox_id = sys.argv[1]
    username = sys.argv[2] if len(sys.argv) >= 3 and not sys.argv[2].startswith('--') else "N/A"
    additional_info = "--additional-info" in sys.argv

    process_user(roblox_id, username, additional_info)

if __name__ == "__main__":
    main()