"""
保险编号批量查询打印自动化脚本

使用方法：
1. 安装依赖：pip install openpyxl selenium pyautogui
2. 下载对应浏览器的 WebDriver（Edge/Chrome），放到 PATH 或脚本同目录
3. 修改下方 ===== 配置区域 ===== 中的参数
4. 运行：python auto_print.py

注意事项：
- 首次运行建议先用少量数据测试（设置 MAX_ROWS = 3）
- 运行期间不要移动鼠标或切换窗口
- 如需中断，按 Ctrl+C
"""

import time
import sys
import openpyxl
import pyautogui
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.edge.service import Service as EdgeService

# ==================== 配置区域 ====================

# Excel 文件路径
EXCEL_FILE = r"C:\Users\14768\Desktop\保险编号.xlsx"

# 工作表名称（None 表示使用第一个工作表）
SHEET_NAME = None

# 保险编号所在列（A=1, B=2, C=3, ...）
COLUMN_INDEX = 1

# 数据起始行（跳过表头，通常从第2行开始）
START_ROW = 2

# 最大处理行数（None 表示处理所有行，调试时可设为 3）
MAX_ROWS = None

# 内部系统登录页 URL
SYSTEM_URL = "http://your-internal-system-url.com"

# --- 页面元素定位 ---
# 查询输入框的定位方式和值
# 常见方式：By.ID, By.NAME, By.CSS_SELECTOR, By.XPATH
INPUT_LOCATOR = (By.ID, "insurance-number-input")  # 改成实际的

# 查询按钮的定位方式和值
SEARCH_BUTTON_LOCATOR = (By.ID, "search-button")  # 改成实际的

# 打印按钮的定位方式和值
PRINT_BUTTON_LOCATOR = (By.ID, "print-button")  # 改成实际的

# --- 时间控制（秒）---
WAIT_AFTER_SEARCH = 3       # 点击查询后等待结果加载的时间
WAIT_AFTER_PRINT_CLICK = 2  # 点击打印按钮后等待打印对话框弹出的时间
WAIT_AFTER_PRINT_CONFIRM = 3  # 确认打印后等待打印完成的时间
WAIT_BETWEEN_ITEMS = 1      # 每条记录之间的间隔时间

# 浏览器选择：'edge' 或 'chrome'
BROWSER = "edge"

# ==================== 配置区域结束 ====================


def read_insurance_numbers():
    """从 Excel 读取保险编号列表"""
    wb = openpyxl.load_workbook(EXCEL_FILE, read_only=True)
    ws = wb[SHEET_NAME] if SHEET_NAME else wb.active

    numbers = []
    for row_idx, row in enumerate(ws.iter_rows(min_row=START_ROW, min_col=COLUMN_INDEX,
                                                max_col=COLUMN_INDEX, values_only=True), start=1):
        if MAX_ROWS and row_idx > MAX_ROWS:
            break
        value = row[0]
        if value is not None:
            numbers.append(str(value).strip())

    wb.close()
    return numbers


def create_driver():
    """创建浏览器驱动"""
    if BROWSER == "edge":
        options = webdriver.EdgeOptions()
        options.add_argument("--start-maximized")
        # 禁用"是否保存密码"等弹窗
        options.add_experimental_option("prefs", {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
        })
        driver = webdriver.Edge(options=options)
    else:
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        options.add_experimental_option("prefs", {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
        })
        driver = webdriver.Chrome(options=options)

    return driver


def process_one(driver, wait, number, index, total):
    """处理单个保险编号：查询 → 打印"""
    print(f"[{index}/{total}] 正在处理编号: {number}")

    # 1. 定位输入框，清空后输入编号
    input_el = wait.until(EC.element_to_be_clickable(INPUT_LOCATOR))
    input_el.click()
    input_el.clear()
    # 用全选+删除确保清空
    input_el.send_keys(Keys.CONTROL, "a")
    input_el.send_keys(Keys.DELETE)
    input_el.send_keys(number)

    # 2. 点击查询按钮
    search_btn = wait.until(EC.element_to_be_clickable(SEARCH_BUTTON_LOCATOR))
    search_btn.click()
    print(f"  -> 已查询，等待 {WAIT_AFTER_SEARCH} 秒加载结果...")
    time.sleep(WAIT_AFTER_SEARCH)

    # 3. 点击打印按钮
    print_btn = wait.until(EC.element_to_be_clickable(PRINT_BUTTON_LOCATOR))
    print_btn.click()
    print(f"  -> 已点击打印，等待 {WAIT_AFTER_PRINT_CLICK} 秒弹出对话框...")
    time.sleep(WAIT_AFTER_PRINT_CLICK)

    # 4. 在系统打印对话框中按 Enter 确认打印
    pyautogui.press("enter")
    print(f"  -> 已确认打印，等待 {WAIT_AFTER_PRINT_CONFIRM} 秒完成...")
    time.sleep(WAIT_AFTER_PRINT_CONFIRM)

    print(f"  ✓ 编号 {number} 处理完成")


def main():
    # 读取编号
    print("=" * 50)
    print("保险编号批量查询打印自动化")
    print("=" * 50)
    print(f"\n正在读取 Excel 文件: {EXCEL_FILE}")

    numbers = read_insurance_numbers()
    if not numbers:
        print("错误：未读取到任何保险编号，请检查 Excel 文件和配置。")
        sys.exit(1)

    total = len(numbers)
    print(f"共读取到 {total} 个保险编号\n")

    # 启动浏览器
    print(f"正在启动 {BROWSER} 浏览器...")
    driver = create_driver()
    wait = WebDriverWait(driver, 15)

    try:
        # 打开系统页面
        print(f"正在打开系统: {SYSTEM_URL}")
        driver.get(SYSTEM_URL)

        # 等待用户手动登录（如果需要）
        input("\n>>> 请在浏览器中完成登录，然后回到这里按 Enter 继续...\n")

        # 如果登录后需要导航到特定页面，取消下面的注释并修改 URL
        # driver.get("http://your-system/query-page")
        # time.sleep(2)

        print(f"\n开始批量处理，共 {total} 条记录\n")
        print("-" * 50)

        success_count = 0
        fail_count = 0
        failed_numbers = []

        for i, number in enumerate(numbers, start=1):
            try:
                process_one(driver, wait, number, i, total)
                success_count += 1
            except Exception as e:
                print(f"  ✗ 编号 {number} 处理失败: {e}")
                fail_count += 1
                failed_numbers.append(number)

            if i < total:
                time.sleep(WAIT_BETWEEN_ITEMS)

        # 汇总
        print("\n" + "=" * 50)
        print("处理完成！")
        print(f"  成功: {success_count}")
        print(f"  失败: {fail_count}")
        if failed_numbers:
            print(f"  失败编号: {', '.join(failed_numbers)}")
        print("=" * 50)

    except KeyboardInterrupt:
        print("\n\n用户中断，正在退出...")
    finally:
        input("\n按 Enter 关闭浏览器...")
        driver.quit()


if __name__ == "__main__":
    main()
