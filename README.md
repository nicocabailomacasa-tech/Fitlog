# Fit Log (Python + MySQL)

## Paano patakbuhin (VS Code)
1. Buksan ang **XAMPP Control Panel** -> i-**Start** ang **MySQL**.
2. Sa terminal ng VS Code (nasa loob ng folder na ito):
   ```
   pip install -r requirements.txt
   python app.py
   ```
3. Buksan ang http://localhost:5000 -> Register -> Log in.

Awtomatikong gagawin ng `app.py` ang database na `fitlog` at mga table (galing sa `schema.sql`) sa unang takbo.
Makikita mo ang data sa phpMyAdmin (http://localhost/phpmyadmin).

## Settings
Default ay XAMPP: user `root`, walang password. Kung may password ang MySQL mo:
`set DB_PASSWORD=iyong_password` (Windows CMD) bago mag-`python app.py`.

## Folder
- `app.py` - Flask backend (login, API, MySQL)
- `schema.sql` - mga table
- `templates/` - mga HTML page
- `static/` - `style.css`, `app.js`
