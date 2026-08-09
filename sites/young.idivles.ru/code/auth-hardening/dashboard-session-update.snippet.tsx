await update({
                          name: saved.name || data.name,
                          email: saved.email || data.email,
                          phone: saved.phone || data.phone || '',
                          image: saved.image || data.image || session.user?.image,
                          ...(typeof json.keepAlive === 'string' && json.keepAlive
                            ? { keepAlive: json.keepAlive }
                          
